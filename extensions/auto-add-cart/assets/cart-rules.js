(function() {
  'use strict';
  
  let shop = Shopify?.shop || window.location.hostname.replace('.myshopify.com', '');
  let cartRules = [];
  let executedRules = new Set();
  let addedProducts = new Set();
  let sessionId = 'session_' + Date.now() + '_' + Math.random();
  let isProcessing = false;
  let processingTimeout = null;
  let lastCartState = null;
  let rulesLoaded = false;
  let cartUpdateInProgress = false; // Flag to prevent loops

  console.log('==== Cart Rules Script Initialized ====');
  console.log('Shop:', shop);
  console.log('Session:', sessionId);
  
  // Debounce function
  function debounce(func, wait) {
    return function executedFunction(...args) {
      clearTimeout(processingTimeout);
      processingTimeout = setTimeout(() => func(...args), wait);
    };
  }
  
  // Refresh cart UI - Works with most Shopify themes
  function refreshCartUI() {
    console.log('🔄 Refreshing cart UI...');
    
    // Method 1: Trigger Shopify theme events
    document.dispatchEvent(new CustomEvent('cart:refresh'));
    
    // Method 2: Fetch and update cart
    fetch('/cart.js')
      .then(res => res.json())
      .then(cart => {
        // Trigger theme-specific cart update
        if (window.Shopify && window.Shopify.theme) {
          document.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
        }
        
        // Update cart count in header
        const cartCountElements = document.querySelectorAll('[data-cart-count], .cart-count, .cart__count, #CartCount');
        cartCountElements.forEach(el => {
          el.textContent = cart.item_count;
          el.setAttribute('data-count', cart.item_count);
        });
        
        // Refresh cart drawer if open
        const cartDrawer = document.querySelector('[data-cart-drawer], .cart-drawer, #CartDrawer');
        if (cartDrawer && cartDrawer.classList.contains('active', 'open', 'is-open')) {
          // Theme uses Ajax cart - trigger refresh
          if (typeof theme !== 'undefined' && theme.cart && theme.cart.refresh) {
            theme.cart.refresh();
          } else if (window.ajaxCart && window.ajaxCart.load) {
            window.ajaxCart.load();
          }
        }
        
        console.log('✅ Cart UI refreshed');
      })
      .catch(err => console.warn('⚠️ Cart UI refresh failed:', err));
  }
  
  // Load rules from your app
  async function loadCartRules() {
    if (rulesLoaded) return;
    
    console.log('📥 Loading cart rules...');
    try {
      const response = await fetch(`http://localhost:52887/api/cart-rules?shop=${shop}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      cartRules = data.rules || [];
      rulesLoaded = true;
      console.log(`✅ Loaded ${cartRules.length} cart rules`);
    } catch (error) {
      console.error('❌ Failed to load cart rules:', error);
      cartRules = [];
    }
  }
  
  // Get current cart
  async function getCurrentCart() {
    try {
      const response = await fetch('/cart.json');
      if (!response.ok) throw new Error('Cart fetch failed');
      return await response.json();
    } catch (error) {
      console.error('❌ Failed to get cart:', error);
      return null;
    }
  }
  
  // Check if cart has changed
  function hasCartChanged(newCart) {
    if (!lastCartState) return true;
    
    const newTotal = newCart.total_price;
    const newItemCount = newCart.item_count;
    
    if (lastCartState.total !== newTotal || lastCartState.itemCount !== newItemCount) {
      return true;
    }
    
    return false;
  }
  
  // Add product to cart
  async function addProductToCart(productId, quantity = 1) {
    try {
      const response = await fetch('/cart/add.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: productId, 
          quantity: quantity
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Added product ${productId} to cart`);
        return result;
      } else {
        const error = await response.json();
        console.warn(`⚠️ Could not add product ${productId}:`, error.description || error.message);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error adding product ${productId}:`, error);
      return null;
    }
  }
  
  // Remove product from cart
  async function removeProductFromCart(productId) {
    try {
      const response = await fetch('/cart/change.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, quantity: 0 })
      });
      
      if (response.ok) {
        console.log(`✅ Removed product ${productId} from cart`);
        addedProducts.delete(productId);
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error(`❌ Error removing product ${productId}:`, error);
      return null;
    }
  }
  
  // Check if rule conditions are met
  function shouldExecuteRule(rule, cart, cartTotal) {
    const ruleKey = `${rule.id}_${sessionId}`;
    
    if (rule.executeOncePerSession && executedRules.has(ruleKey)) {
      return false;
    }
    
    if (cartTotal < rule.minCartValue) {
      return false;
    }
    
    if (rule.hasUpperLimit && cartTotal > rule.maxCartValue) {
      return false;
    }
    
    return true;
  }
  
  // Execute rule - add products
  async function executeRule(rule, cart) {
    const productIds = JSON.parse(rule.productIds || '[]');
    let anyAdded = false;

    for (const productId of productIds) {
      if (addedProducts.has(productId)) {
        continue;
      }

      const existingItem = cart.items.find(item => item.id == productId);
      if (existingItem) {
        addedProducts.add(productId);
        continue;
      }

      const result = await addProductToCart(productId);
      if (result) {
        addedProducts.add(productId);
        anyAdded = true;
        console.log(`🎁 Rule "${rule.name}": Added product ${productId}`);
      }
    }

    if (anyAdded) {
      const ruleKey = `${rule.id}_${sessionId}`;
      executedRules.add(ruleKey);

      // Track execution (non-blocking)
      trackRuleExecution(rule, cart).catch(err => 
        console.warn('⚠️ Failed to track rule execution:', err)
      );
      
      return true; // Indicate that products were added
    }
    
    return false;
  }
  
  // Execute reverse rule - remove products
  async function executeReverseRule(rule, cart) {
    const productIds = JSON.parse(rule.productIds || '[]');
    let anyRemoved = false;
    
    for (const productId of productIds) {
      if (!addedProducts.has(productId)) {
        continue;
      }
      
      const existingItem = cart.items.find(item => item.id == productId);
      if (existingItem) {
        await removeProductFromCart(productId);
        anyRemoved = true;
        console.log(`🔄 Rule "${rule.name}": Removed product ${productId} (reverse)`);
      }
    }
    
    return anyRemoved;
  }
  
  // Track rule execution
  async function trackRuleExecution(rule, cart) {
    try {
      await fetch('http://localhost:52887/api/cart-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: rule.id,
          sessionId: sessionId,
          cartId: cart.token,
          shop: shop
        })
      });
    } catch (error) {
      console.warn('⚠️ Tracking failed:', error.message);
    }
  }
  
  // Main function to check and execute rules
  async function checkCartRules() {
    // Prevent overlapping executions
    if (isProcessing) {
      console.log('⏳ Already processing, skipping...');
      return;
    }
    
    // Don't trigger rules if we're in the middle of a cart update
    if (cartUpdateInProgress) {
      console.log('⏳ Cart update in progress, skipping rule check...');
      return;
    }
    
    isProcessing = true;
    
    try {
      // Ensure rules are loaded
      if (!rulesLoaded) {
        await loadCartRules();
      }
      
      if (cartRules.length === 0) {
        return;
      }
      
      // Get current cart
      const cart = await getCurrentCart();
      if (!cart) return;
      
      // Check if cart changed
      if (!hasCartChanged(cart)) {
        return;
      }
      
      const cartTotal = cart.total_price / 100;
      console.log(`🛒 Cart Total: ${cartTotal} | Items: ${cart.item_count}`);
      
      // Update last cart state
      lastCartState = {
        total: cart.total_price,
        itemCount: cart.item_count
      };
      
      let cartModified = false;
      
      // Process each rule
      for (const rule of cartRules) {
        const shouldExecute = shouldExecuteRule(rule, cart, cartTotal);
        
        if (shouldExecute) {
          const wasAdded = await executeRule(rule, cart);
          if (wasAdded) cartModified = true;
        } else if (rule.worksInReverse) {
          const belowMin = cartTotal < rule.minCartValue;
          const aboveMax = rule.hasUpperLimit && cartTotal > rule.maxCartValue;
          
          if (belowMin || aboveMax) {
            const wasRemoved = await executeReverseRule(rule, cart);
            if (wasRemoved) cartModified = true;
          }
        }
      }
      
      // Refresh UI if cart was modified
      if (cartModified) {
        console.log('✨ Cart modified by rules, refreshing UI...');
        
        // Set flag to prevent loop
        cartUpdateInProgress = true;
        
        // Refresh the cart UI
        refreshCartUI();
        
        // Clear flag after a short delay
        setTimeout(() => {
          cartUpdateInProgress = false;
        }, 1000);
      }
      
    } catch (error) {
      console.error('❌ Error in checkCartRules:', error);
    } finally {
      isProcessing = false;
    }
  }
  
  // Debounced version - waits 500ms after last trigger
  const debouncedCheckRules = debounce(checkCartRules, 500);
  
  // Initialize
  async function init() {
    console.log('🚀 Initializing cart rules...');
    
    // Load rules and check cart once on init
    await loadCartRules();
    await checkCartRules();
    
    // Listen to Shopify cart events (debounced)
    document.addEventListener('cart:updated', (e) => {
      if (!cartUpdateInProgress) {
        debouncedCheckRules();
      }
    });
    
    document.addEventListener('cart:changed', (e) => {
      if (!cartUpdateInProgress) {
        debouncedCheckRules();
      }
    });
    
    // Theme-specific events
    if (typeof window.theme !== 'undefined') {
      document.addEventListener('theme:cart:change', (e) => {
        if (!cartUpdateInProgress) {
          debouncedCheckRules();
        }
      });
    }
    
    // Ajax cart events (for themes using Ajax cart)
    document.addEventListener('ajaxCart.afterCartLoad', (e) => {
      if (!cartUpdateInProgress) {
        debouncedCheckRules();
      }
    });
    
    // Listen to cart drawer open events
    document.addEventListener('cart:open', debouncedCheckRules);
    document.addEventListener('cart-drawer:open', debouncedCheckRules);
    
    // Periodic check every 30 seconds
    setInterval(() => {
      if (!isProcessing && !cartUpdateInProgress) {
        checkCartRules();
      }
    }, 30000);
    
    console.log('✅ Cart rules script ready');
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Expose for manual testing
  window.cartRulesDebug = {
    checkNow: checkCartRules,
    reload: async () => {
      rulesLoaded = false;
      await loadCartRules();
      await checkCartRules();
    },
    refresh: refreshCartUI,
    status: () => ({
      rulesLoaded: rulesLoaded,
      rulesCount: cartRules.length,
      executedRules: Array.from(executedRules),
      addedProducts: Array.from(addedProducts),
      isProcessing: isProcessing,
      cartUpdateInProgress: cartUpdateInProgress
    })
  };
  
})();