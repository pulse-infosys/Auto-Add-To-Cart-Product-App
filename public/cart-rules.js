(function() {
  'use strict';
  
  let shop = Shopify?.shop || window.location.hostname.replace('.myshopify.com', '');
  let cartRules = [];
  let executedRules = new Set();
  let sessionId = 'session_' + Date.now() + '_' + Math.random();
  
  // Load rules from your app
  async function loadCartRules() {
    try {
      const response = await fetch(`https://yourapp.com/api/cart-rules?shop=${shop}`);
      const data = await response.json();
      cartRules = data.rules || [];
      console.log('Cart rules loaded:', cartRules.length);
    } catch (error) {
      console.error('Failed to load cart rules:', error);
    }
  }
  
  // Get current cart
  async function getCurrentCart() {
    try {
      const response = await fetch('/cart.json');
      return await response.json();
    } catch (error) {
      console.error('Failed to get cart:', error);
      return null;
    }
  }
  
  // Add product to cart
  async function addProductToCart(productId, quantity = 1) {
    try {
      const response = await fetch('/cart/add.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: productId,
          quantity: quantity
        })
      });
      
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Failed to add product to cart:', error);
      return null;
    }
  }
  
  // Remove product from cart
  async function removeProductFromCart(productId) {
    try {
      const response = await fetch('/cart/change.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: productId,
          quantity: 0
        })
      });
      
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Failed to remove product from cart:', error);
      return null;
    }
  }
  
  // Check if rule should execute
  function shouldExecuteRule(rule, cart, cartTotal) {
    const ruleKey = `${rule.id}_${sessionId}`;
    
    // Check if already executed and should only execute once per session
    if (rule.executeOncePerSession && executedRules.has(ruleKey)) {
      return false;
    }
    
    // Check cart value conditions
    if (cartTotal < rule.minCartValue) {
      return false;
    }
    
    if (rule.hasUpperLimit && cartTotal > rule.maxCartValue) {
      return false;
    }
    
    return true;
  }
  
  // Execute rule
  async function executeRule(rule, cart) {
    const productIds = JSON.parse(rule.productIds || '[]');
    let executed = false;
    
    for (const productId of productIds) {
      // Check if product is already in cart
      const existingItem = cart.items.find(item => item.id == productId);
      
      if (!existingItem) {
        const result = await addProductToCart(productId);
        if (result) {
          executed = true;
          console.log(`Added product ${productId} to cart via rule: ${rule.name}`);
        }
      }
    }
    
    if (executed) {
      // Track execution
      const ruleKey = `${rule.id}_${sessionId}`;
      executedRules.add(ruleKey);
      
      // Send execution tracking to your app
      try {
        await fetch('https://yourapp.com/api/cart-rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ruleId: rule.id,
            sessionId: sessionId,
            cartId: cart.token,
            shop: shop
          })
        });
      } catch (error) {
        console.error('Failed to track rule execution:', error);
      }
    }
  }
  
  // Execute reverse rule (remove products)
  async function executeReverseRule(rule, cart) {
    const productIds = JSON.parse(rule.productIds || '[]');
    
    for (const productId of productIds) {
      const existingItem = cart.items.find(item => item.id == productId);
      
      if (existingItem) {
        await removeProductFromCart(productId);
        console.log(`Removed product ${productId} from cart via reverse rule: ${rule.name}`);
      }
    }
  }
  
  // Main function to check and execute rules
  async function checkCartRules() {
    if (cartRules.length === 0) return;
    
    const cart = await getCurrentCart();
    if (!cart) return;
    
    const cartTotal = cart.total_price / 100; // Convert from cents to currency
    
    for (const rule of cartRules) {
      const shouldExecute = shouldExecuteRule(rule, cart, cartTotal);
      
      if (shouldExecute) {
        await executeRule(rule, cart);
      } else if (rule.worksInReverse) {
        // If rule doesn't meet conditions but works in reverse, remove products
        await executeReverseRule(rule, cart);
      }
    }
  }
  
  // Initialize
  async function init() {
    await loadCartRules();
    await checkCartRules();
    
    // Listen for cart changes
    document.addEventListener('cart:updated', checkCartRules);
    document.addEventListener('cart:changed', checkCartRules);
    
    // For themes that don't trigger events, poll periodically
    setInterval(checkCartRules, 3000);
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();