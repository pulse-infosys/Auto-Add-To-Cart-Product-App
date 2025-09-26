import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  DataTable,
  Badge,
  Modal,
  FormLayout,
  TextField,
  Select,
  RadioButton,
  Checkbox,
  BlockStack,
  Banner,
  Text,
  Toast,
  Frame
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getRules, createRule, updateRule, deleteRule } from "../models/rule.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    const rules = await getRules(session.shop);
    
    // Fetch products for display
    const productsResponse = await admin.graphql(`
      query GetProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              status
              images(first: 10) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    availableForSale
                  }
                }
              }
            }
          }
        }
      }
    `, {
      variables: { first: 250 }
    });

    const productsData = await productsResponse.json();
    const products = productsData.data.products.edges.map(edge => edge.node);

    return json({ 
      rules: rules.map(rule => ({
        ...rule,
        triggerProducts: rule.triggerProducts || [],
        actionProducts: rule.actionProducts || [],
        options: rule.options || {}
      })), 
      products,
      shop: session.shop
    });
  } catch (error) {
    console.error('Error loading rules:', error);
    return json({ rules: [], products: [], error: error.message });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create_rule") {
      const ruleData = {
        name: formData.get("ruleName"),
        trigger: formData.get("trigger"),
        threshold: formData.get("threshold") ? parseFloat(formData.get("threshold")) : null,
        triggerProducts: JSON.parse(formData.get("triggerProducts") || "[]"),
        triggerCollections: JSON.parse(formData.get("triggerCollections") || "[]"),
        triggerTags: JSON.parse(formData.get("triggerTags") || "[]"),
        action: formData.get("action"),
        actionProducts: JSON.parse(formData.get("actionProducts") || "[]"),
        options: JSON.parse(formData.get("options") || "{}"),
        status: "active"
      };

      const rule = await createRule(session.shop, ruleData);
      
      // Install webhook if this is the first rule
      const allRules = await getRules(session.shop);
      if (allRules.length === 1) {
        await installWebhooks(admin);
      }
      
      return json({ success: true, rule, message: "Rule created successfully!" });
    }

    if (intent === "update_rule") {
      const ruleId = parseInt(formData.get("ruleId"));
      const ruleData = {
        name: formData.get("ruleName"),
        trigger: formData.get("trigger"),
        threshold: formData.get("threshold") ? parseFloat(formData.get("threshold")) : null,
        triggerProducts: JSON.parse(formData.get("triggerProducts") || "[]"),
        actionProducts: JSON.parse(formData.get("actionProducts") || "[]"),
        options: JSON.parse(formData.get("options") || "{}"),
      };

      const rule = await updateRule(ruleId, session.shop, ruleData);
      return json({ success: true, rule, message: "Rule updated successfully!" });
    }

    if (intent === "delete_rule") {
      const ruleId = parseInt(formData.get("ruleId"));
      await deleteRule(ruleId, session.shop);
      return json({ success: true, message: "Rule deleted successfully!" });
    }

    if (intent === "toggle_status") {
      const ruleId = parseInt(formData.get("ruleId"));
      const currentStatus = formData.get("currentStatus");
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      
      const rule = await updateRule(ruleId, session.shop, { status: newStatus });
      return json({ success: true, rule, message: `Rule ${newStatus}!` });
    }

  } catch (error) {
    console.error('Error in action:', error);
    return json({ success: false, error: error.message });
  }

  return json({ success: false, error: "Unknown action" });
};

// Install webhooks for cart updates
async function installWebhooks(admin) {
  const webhookTopics = ['carts/create', 'carts/update'];
  
  for (const topic of webhookTopics) {
    try {
      await admin.graphql(`
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          topic: topic.toUpperCase().replace('/', '_'),
          webhookSubscription: {
            callbackUrl: `${process.env.SHOPIFY_APP_URL}/webhooks/cart/${topic.split('/')[1]}`,
            format: "JSON"
          }
        }
      });
    } catch (error) {
      console.error(`Error installing ${topic} webhook:`, error);
    }
  }
}

export default function RulesIndex() {
  const { rules, products, error } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productPickerType, setProductPickerType] = useState(null); // 'trigger' or 'action'
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  
  const [ruleData, setRuleData] = useState({
    name: "",
    trigger: "cart_value",
    threshold: "",
    triggerProducts: [],
    triggerCollections: [],
    triggerTags: [],
    action: "add_product",
    actionProducts: [],
    options: {
      worksInReverse: false,
      allowMultipleTriggers: false,
      oncePerSession: false,
      hasUpperLimit: false,
      upperLimit: "",
      preventQuantityChange: false,
      preventOutsidePurchase: false,
      showNotification: false,
      notificationMessage: "Free gift added to your cart!",
      showBanner: false,
      bannerMessage: "Add {threshold} more to get a free gift!",
      discountType: "none",
      discountValue: 0,
      discountAmount: 0
    }
  });

  // temporary selection state for product picker (array of product ids)
  const [tempSelectedIds, setTempSelectedIds] = useState([]);

  // Show toast message
  useEffect(() => {
    if (actionData?.success && actionData?.message) {
      setToastMessage(actionData.message);
      setShowToast(true);
      if (showModal) setShowModal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  // sync tempSelectedIds when product picker opens
  useEffect(() => {
    if (showProductPicker) {
      if (productPickerType === "trigger") {
        setTempSelectedIds(ruleData.triggerProducts.map(p => p.id));
      } else if (productPickerType === "action") {
        setTempSelectedIds(ruleData.actionProducts.map(p => p.id));
      } else {
        setTempSelectedIds([]);
      }
    } else {
      // clear selection when closed
      setTempSelectedIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProductPicker, productPickerType]);

  const handleCreateRule = useCallback(() => {
    setEditingRule(null);
    resetRuleData();
    setShowModal(true);
  }, []);

  const handleEditRule = useCallback((rule) => {
    setEditingRule(rule);
    setRuleData({
      name: rule.name,
      trigger: rule.trigger,
      threshold: rule.threshold?.toString() || "",
      triggerProducts: rule.triggerProducts || [],
      triggerCollections: rule.triggerCollections || [],
      triggerTags: rule.triggerTags || [],
      action: rule.action,
      actionProducts: rule.actionProducts || [],
      options: { ...ruleData.options, ...rule.options }
    });
    setShowModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleData.options]);

  const resetRuleData = () => {
    setRuleData({
      name: "",
      trigger: "cart_value",
      threshold: "",
      triggerProducts: [],
      triggerCollections: [],
      triggerTags: [],
      action: "add_product",
      actionProducts: [],
      options: {
        worksInReverse: false,
        allowMultipleTriggers: false,
        oncePerSession: false,
        hasUpperLimit: false,
        upperLimit: "",
        preventQuantityChange: false,
        preventOutsidePurchase: false,
        showNotification: false,
        notificationMessage: "Free gift added to your cart!",
        showBanner: false,
        bannerMessage: "Add {threshold} more to get a free gift!",
        discountType: "none",
        discountValue: 0,
        discountAmount: 0
      }
    });
  };

  const handleDeleteRule = useCallback((ruleId) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      const formData = new FormData();
      formData.append("intent", "delete_rule");
      formData.append("ruleId", ruleId.toString());
      submit(formData, { method: "post" });
    }
  }, [submit]);

  const handleToggleStatus = useCallback((ruleId, currentStatus) => {
    const formData = new FormData();
    formData.append("intent", "toggle_status");
    formData.append("ruleId", ruleId.toString());
    formData.append("currentStatus", currentStatus);
    submit(formData, { method: "post" });
  }, [submit]);

  // This function was in your earlier code and expects a selection array
  // where each item has id, title, handle, image, variantId, price (for action products).
  const handleProductSelection = (selection) => {
    if (productPickerType === 'trigger') {
      setRuleData(prev => ({
        ...prev,
        triggerProducts: selection.map(product => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          image: product.images?.[0]?.url
        }))
      }));
    } else if (productPickerType === 'action') {
      setRuleData(prev => ({
        ...prev,
        actionProducts: selection.map(product => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          image: product.images?.[0]?.url,
          variantId: product.variants?.[0]?.id,
          price: product.variants?.[0]?.price
        }))
      }));
    }
    setShowProductPicker(false);
  };

  const toggleTempSelection = (productId) => {
    setTempSelectedIds(prev => {
      if (prev.includes(productId)) return prev.filter(id => id !== productId);
      return [...prev, productId];
    });
  };

  const confirmTempSelection = () => {
    const selectedProducts = products
      .filter(p => tempSelectedIds.includes(p.id))
      .map(p => {
        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          images: p.images?.edges?.map(e => ({ url: e.node.url, altText: e.node.altText })) || [],
          variants: p.variants?.edges?.map(e => ({ id: e.node.id, price: e.node.price })) || []
        };
      });

    // call the existing handler to normalize and set into ruleData
    handleProductSelection(selectedProducts);
    // close modal handled inside handleProductSelection
  };

  const cancelProductPicker = () => {
    setShowProductPicker(false);
    setTempSelectedIds([]);
  };

  const formatTriggerDisplay = (rule) => {
    switch (rule.trigger) {
      case 'cart_value':
        return `Cart value ≥ ₹${rule.threshold}`;
      case 'product':
        return `Products: ${rule.triggerProducts?.map(p => p.title).join(', ') || 'None selected'}`;
      case 'collection':
        return `Collections: ${rule.triggerCollections?.length || 0} selected`;
      case 'product_tags':
        return `Tags: ${rule.triggerTags?.join(', ') || 'None'}`;
      default:
        return rule.trigger;
    }
  };

  const formatActionDisplay = (rule) => {
    if (rule.action === 'add_product') {
      return `Auto add: ${rule.actionProducts?.map(p => p.title).join(', ') || 'None selected'}`;
    }
    return 'Customer choice';
  };

  const rows = rules.map(rule => [
    rule.name,
    <Badge status={rule.status === "active" ? "success" : "critical"} key={rule.id}>
      {rule.status}
    </Badge>,
    formatTriggerDisplay(rule),
    formatActionDisplay(rule),
    new Date(rule.createdAt).toLocaleDateString(),
    <div style={{ display: 'flex', gap: '8px' }} key={rule.id}>
      <Button size="micro" onClick={() => handleEditRule(rule)}>
        Edit
      </Button>
      <Button 
        size="micro" 
        tone={rule.status === 'active' ? 'critical' : 'success'}
        onClick={() => handleToggleStatus(rule.id, rule.status)}
      >
        {rule.status === 'active' ? 'Deactivate' : 'Activate'}
      </Button>
      <Button 
        size="micro" 
        tone="critical" 
        onClick={() => handleDeleteRule(rule.id)}
      >
        Delete
      </Button>
    </div>
  ]);

  const toastMarkup = showToast ? (
    <Toast 
      content={toastMessage} 
      onDismiss={() => setShowToast(false)} 
    />
  ) : null;

  return (
    <Frame>
      <Page
        title="Auto Add to Cart Rules"
        primaryAction={{
          content: "Create rule",
          onAction: handleCreateRule
        }}
      >
        {toastMarkup}

        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Error loading rules">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '20px' }}>
                <Text variant="headingMd" as="h2">Free Gift Template</Text>
                <Text variant="bodyMd" color="subdued">
                  Automatically add a free product to the cart when customers meet your requirements.
                </Text>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px',
                  marginTop: '20px'
                }}>
                  <Card sectioned>
                    <BlockStack vertical>
                      <Text variant="headingMd">🎁 Auto add a free gift</Text>
                      <Text variant="bodyMd" color="subdued">
                        Automatically adds a free product to the cart when the customer meets the chosen trigger threshold.
                      </Text>
                      <Button onClick={handleCreateRule}>
                        Create Free Gift Rule
                      </Button>
                    </BlockStack>
                  </Card>
                </div>
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Rule Name', 'Status', 'Trigger', 'Action', 'Created', 'Actions']}
                rows={rows}
                footerContent={`${rules.length} rules total`}
              />
            </Card>
          </Layout.Section>
        </Layout>

        {/* Create/Edit Rule Modal */}
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editingRule ? "Edit Rule" : "Create a new rule"}
          large
          primaryAction={{
            content: editingRule ? "Update Rule" : "Save Rule",
            onAction: () => {
              document.getElementById('rule-form').requestSubmit();
            },
            loading: navigation.state === "submitting"
          }}
          secondaryActions={[{
            content: "Cancel",
            onAction: () => setShowModal(false)
          }]}
        >
          <Modal.Section>
            <Form method="post" id="rule-form">
              <input type="hidden" name="intent" value={editingRule ? "update_rule" : "create_rule"} />
              {editingRule && <input type="hidden" name="ruleId" value={editingRule.id} />}
              <input type="hidden" name="triggerProducts" value={JSON.stringify(ruleData.triggerProducts)} />
              <input type="hidden" name="triggerCollections" value={JSON.stringify(ruleData.triggerCollections)} />
              <input type="hidden" name="triggerTags" value={JSON.stringify(ruleData.triggerTags)} />
              <input type="hidden" name="actionProducts" value={JSON.stringify(ruleData.actionProducts)} />
              <input type="hidden" name="options" value={JSON.stringify(ruleData.options)} />
              
              <FormLayout>
                <TextField
                  label="Rule name"
                  name="ruleName"
                  value={ruleData.name}
                  onChange={(value) => setRuleData(prev => ({ ...prev, name: value }))}
                  autoComplete="off"
                  requiredIndicator
                />

                <BlockStack vertical>
                  <Text variant="headingMd">Rule trigger</Text>
                  
                  <RadioButton
                    label="Cart value"
                    helpText="Trigger the rule when a customer's cart reaches a certain value."
                    checked={ruleData.trigger === "cart_value"}
                    id="cart_value"
                    name="trigger"
                    onChange={() => setRuleData(prev => ({ ...prev, trigger: "cart_value" }))}
                  />
                  
                  <RadioButton
                    label="Specific products"
                    helpText="Trigger the rule when specific products are added to cart."
                    checked={ruleData.trigger === "product"}
                    id="product"
                    name="trigger"
                    onChange={() => setRuleData(prev => ({ ...prev, trigger: "product" }))}
                  />
                </BlockStack>

                {ruleData.trigger === "cart_value" && (
                  <BlockStack vertical>
                    <TextField
                      label="Minimum cart value"
                      name="threshold"
                      value={ruleData.threshold}
                      onChange={(value) => setRuleData(prev => ({ ...prev, threshold: value }))}
                      prefix="₹"
                      type="number"
                      requiredIndicator
                    />
                    
                    <Checkbox
                      label="Add an upper cart value limit"
                      checked={ruleData.options.hasUpperLimit}
                      onChange={(checked) => setRuleData(prev => ({
                        ...prev,
                        options: { ...prev.options, hasUpperLimit: checked }
                      }))}
                    />
                    
                    {ruleData.options.hasUpperLimit && (
                      <TextField
                        label="Maximum cart value"
                        value={ruleData.options.upperLimit}
                        onChange={(value) => setRuleData(prev => ({
                          ...prev,
                          options: { ...prev.options, upperLimit: value }
                        }))}
                        prefix="₹"
                        type="number"
                      />
                    )}
                  </BlockStack>
                )}

                {ruleData.trigger === "product" && (
                  <BlockStack vertical>
                    <Text variant="bodyMd">Selected trigger products: {ruleData.triggerProducts.length}</Text>
                    {ruleData.triggerProducts.map(product => (
                      <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', border: '1px solid #e1e1e1', borderRadius: '4px' }}>
                        {product.image && <img src={product.image} alt={product.title} style={{ width: '32px', height: '32px', objectFit: 'cover' }} />}
                        <Text>{product.title}</Text>
                      </div>
                    ))}
                    <Button 
                      onClick={() => {
                        setProductPickerType('trigger');
                        setShowProductPicker(true);
                      }}
                    >
                      {ruleData.triggerProducts.length > 0 ? 'Change Products' : 'Select Products'}
                    </Button>
                  </BlockStack>
                )}

                <BlockStack vertical>
                  <Text variant="headingMd">Rule action</Text>
                  
                  <RadioButton
                    label="Automatically add products to cart"
                    helpText="Choose this to add free gifts which don't require a customer's selection."
                    checked={ruleData.action === "add_product"}
                    id="add_product"
                    name="action"
                    onChange={() => setRuleData(prev => ({ ...prev, action: "add_product" }))}
                  />
                </BlockStack>

                {ruleData.action === "add_product" && (
                  <BlockStack vertical>
                    <Text variant="bodyMd">Selected gift products: {ruleData.actionProducts.length}</Text>
                    {ruleData.actionProducts.map(product => (
                      <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', border: '1px solid #e1e1e1', borderRadius: '4px' }}>
                        {product.image && <img src={product.image} alt={product.title} style={{ width: '32px', height: '32px', objectFit: 'cover' }} />}
                        <Text>{product.title}</Text>
                        <Text variant="bodyMd" color="subdued">₹{product.price}</Text>
                      </div>
                    ))}
                    <Button 
                      onClick={() => {
                        setProductPickerType('action');
                        setShowProductPicker(true);
                      }}
                    >
                      {ruleData.actionProducts.length > 0 ? 'Change Gift Products' : 'Select Gift Products'}
                    </Button>
                  </BlockStack>
                )}

                <BlockStack vertical>
                  <Text variant="headingMd">Advanced Options</Text>
                  
                  <Checkbox
                    label="Rule works in reverse"
                    helpText="Remove the free gift if the cart no longer meets the conditions."
                    checked={ruleData.options.worksInReverse}
                    onChange={(checked) => setRuleData(prev => ({
                      ...prev,
                      options: { ...prev.options, worksInReverse: checked }
                    }))}
                  />
                  
                  <Checkbox
                    label="Allow multiple triggers per cart"
                    helpText="The rule can execute multiple times if conditions are met repeatedly."
                    checked={ruleData.options.allowMultipleTriggers}
                    onChange={(checked) => setRuleData(prev => ({
                      ...prev,
                      options: { ...prev.options, allowMultipleTriggers: checked }
                    }))}
                  />
                  
                  <Checkbox
                    label="Only execute once per session"
                    helpText="The rule will only execute once per visitor session."
                    checked={ruleData.options.oncePerSession}
                    onChange={(checked) => setRuleData(prev => ({
                      ...prev,
                      options: { ...prev.options, oncePerSession: checked }
                    }))}
                  />
                  
                  <Checkbox
                    label="Prevent quantity changes"
                    helpText="Customers cannot modify the quantity of automatically added items."
                    checked={ruleData.options.preventQuantityChange}
                    onChange={(checked) => setRuleData(prev => ({
                      ...prev,
                      options: { ...prev.options, preventQuantityChange: checked }
                    }))}
                  />
                </BlockStack>

                <BlockStack vertical>
                  <Text variant="headingMd">Notifications</Text>
                  
                  <Checkbox
                    label="Show notification when gift is added"
                    checked={ruleData.options.showNotification}
                    onChange={(checked) => setRuleData(prev => ({
                      ...prev,
                      options: { ...prev.options, showNotification: checked }
                    }))}
                  />
                  
                  {ruleData.options.showNotification && (
                    <TextField
                      label="Notification message"
                      value={ruleData.options.notificationMessage}
                      onChange={(value) => setRuleData(prev => ({
                        ...prev,
                        options: { ...prev.options, notificationMessage: value }
                      }))}
                    />
                  )}
                </BlockStack>

                <BlockStack vertical>
                  <Text variant="headingMd">Promotional Banner</Text>
                  
                  <Checkbox
                    label="Show promotional banner"
                    helpText="Display a banner to inform customers about the free gift offer."
                    checked={ruleData.options.showBanner}
                    onChange={(checked) => setRuleData(prev => ({
                      ...prev,
                      options: { ...prev.options, showBanner: checked }
                    }))}
                  />
                  
                  {ruleData.options.showBanner && (
                    <TextField
                      label="Banner message"
                      value={ruleData.options.bannerMessage}
                      onChange={(value) => setRuleData(prev => ({
                        ...prev,
                        options: { ...prev.options, bannerMessage: value }
                      }))}
                      helpText="Use {threshold} to display the cart value requirement"
                    />
                  )}
                </BlockStack>
              </FormLayout>
            </Form>
          </Modal.Section>
        </Modal>

        {/* Simple Product Picker Modal */}
        <Modal
          open={showProductPicker}
          onClose={cancelProductPicker}
          title={`Select ${productPickerType === 'trigger' ? 'Trigger' : 'Gift'} Products`}
          large
        >
          <Modal.Section>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {products.map(product => {
                const thumbnail = product.images?.edges?.[0]?.node?.url;
                const isSelected = tempSelectedIds.includes(product.id);
                return (
                  <div 
                    key={product.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px', 
                      padding: '12px', 
                      border: isSelected ? '2px solid #5c6ac4' : '1px solid #e1e1e1', 
                      borderRadius: '8px',
                      margin: '8px 0',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(92,106,196,0.05)' : 'transparent'
                    }}
                    onClick={() => toggleTempSelection(product.id)}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => toggleTempSelection(product.id)} 
                      style={{ width: '16px', height: '16px' }}
                    />
                    {thumbnail ? (
                      <img src={thumbnail} alt={product.title} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                    ) : (
                      <div style={{ width: '48px', height: '48px', background: '#f4f4f4', borderRadius: '4px' }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{product.title}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{product.handle}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px' }}>{product.variants?.edges?.[0]?.node?.price ? `₹${product.variants.edges[0].node.price}` : ''}</div>
                      <div style={{ fontSize: '12px', color: '#999' }}>{product.status}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button onClick={cancelProductPicker} outline>Cancel</Button>
              <Button onClick={confirmTempSelection} primary disabled={tempSelectedIds.length === 0}>
                Confirm selection ({tempSelectedIds.length})
              </Button>
            </div>
          </Modal.Section>
        </Modal>
      </Page>
    </Frame>
  );
}
