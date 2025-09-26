import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, Link } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma  from "../db.server";
import { useState } from "react";

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const ruleData = {
    shop: session.shop,
    name: formData.get("name"),
    minCartValue: parseFloat(formData.get("minCartValue")),
    hasUpperLimit: formData.get("hasUpperLimit") === "on",
    maxCartValue: formData.get("hasUpperLimit") === "on" ? parseFloat(formData.get("maxCartValue")) : null,
    actionType: "add_products",
    productIds: JSON.stringify(formData.getAll("productIds")),
    worksInReverse: formData.get("worksInReverse") === "on",
    allowMultipleTriggers: formData.get("allowMultipleTriggers") === "on",
    executeOncePerSession: formData.get("executeOncePerSession") === "on",
    preventQuantityChanges: formData.get("preventQuantityChanges") === "on",
  };

  console.log('ruleData===',ruleData);

  try {
    const rule = await prisma.cartRule.create({ data: ruleData });
    
    // Install the script tag for frontend functionality
    await installScriptTag(admin, session.shop);
    
    return redirect("/");
  } catch (error) {
    return json({ error: error.message }, { status: 400 });
  }
}

async function installScriptTag(admin, shop) {
  try {
    const scriptTag = new admin.rest.resources.ScriptTag({ session: admin.session });
    scriptTag.event = "onload";
    scriptTag.src = `https://yourapp.com/cart-rules.js?shop=${shop}`;
    await scriptTag.save({ update: true });
  } catch (error) {
    console.log("Script tag installation error:", error);
  }
}

export default function NewRule() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const [hasUpperLimit, setHasUpperLimit] = useState(false);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", maxWidth: "800px" }}>
      <div style={{ marginBottom: "30px" }}>
        <Link to="/" style={{ color: "#5C6AC4", textDecoration: "none" }}>← Back to Rules</Link>
        <h1 style={{ margin: "10px 0 0 0", fontSize: "24px", fontWeight: "bold" }}>Create New Rule</h1>
      </div>

      {actionData?.error && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: "#f8d7da", 
          color: "#721c24", 
          borderRadius: "6px", 
          marginBottom: "20px" 
        }}>
          {actionData.error}
        </div>
      )}

      <Form method="post" style={{ backgroundColor: "white", padding: "30px", borderRadius: "8px", border: "1px solid #e1e5e9" }}>
        <div style={{ marginBottom: "24px" }}>
          <label htmlFor="name" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
            Rule Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            placeholder="e.g., Free shipping over ₹500"
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: "16px"
            }}
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Cart Value Conditions</h3>
          
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="minCartValue" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Minimum Cart Value (₹) *
            </label>
            <input
              type="number"
              id="minCartValue"
              name="minCartValue"
              required
              min="0"
              step="0.01"
              placeholder="500"
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "16px"
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                name="hasUpperLimit"
                checked={hasUpperLimit}
                onChange={(e) => setHasUpperLimit(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span style={{ fontWeight: "500" }}>Add an upper cart value limit</span>
            </label>
          </div>

          {hasUpperLimit && (
            <div style={{ marginBottom: "16px", marginLeft: "24px" }}>
              <label htmlFor="maxCartValue" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
                Maximum Cart Value (₹) *
              </label>
              <input
                type="number"
                id="maxCartValue"
                name="maxCartValue"
                required={hasUpperLimit}
                min="0"
                step="0.01"
                placeholder="2000"
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "16px"
                }}
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Rule Action</h3>
          <div style={{ 
            padding: "16px", 
            backgroundColor: "#f8f9fa", 
            borderRadius: "6px",
            border: "1px solid #e9ecef"
          }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>Automatically add products to cart</h4>
            <p style={{ margin: "0 0 12px 0", color: "#666", fontSize: "14px" }}>
              Choose this to add free gifts which don't require a customer's selection.
            </p>
            
            <label htmlFor="productIds" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Product IDs to Add (comma separated) *
            </label>
            <input
              type="text"
              id="productIds"
              name="productIds"
              required
              placeholder="e.g., 123456789,987654321"
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "16px"
              }}
            />
            <small style={{ color: "#666", fontSize: "12px" }}>
              Enter Shopify product IDs separated by commas
            </small>
          </div>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Advanced Options</h3>
          
          <div style={{ display: "grid", gap: "12px" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                name="worksInReverse"
                style={{ width: "16px", height: "16px", marginTop: "2px" }}
              />
              <div>
                <span style={{ fontWeight: "500", display: "block" }}>Rule works in reverse</span>
                <small style={{ color: "#666" }}>Remove the free gift if the cart no longer meets the conditions.</small>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                name="allowMultipleTriggers"
                style={{ width: "16px", height: "16px", marginTop: "2px" }}
              />
              <div>
                <span style={{ fontWeight: "500", display: "block" }}>Allow multiple triggers per cart</span>
                <small style={{ color: "#666" }}>The rule can execute multiple times if conditions are met repeatedly.</small>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                name="executeOncePerSession"
                style={{ width: "16px", height: "16px", marginTop: "2px" }}
              />
              <div>
                <span style={{ fontWeight: "500", display: "block" }}>Only execute once per session</span>
                <small style={{ color: "#666" }}>The rule will only execute once per visitor session.</small>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                name="preventQuantityChanges"
                style={{ width: "16px", height: "16px", marginTop: "2px" }}
              />
              <div>
                <span style={{ fontWeight: "500", display: "block" }}>Prevent quantity changes</span>
                <small style={{ color: "#666" }}>Customers cannot modify the quantity of automatically added items.</small>
              </div>
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "30px" }}>
          <Link
            to="/"
            style={{
              padding: "12px 20px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              color: "#333",
              textDecoration: "none",
              backgroundColor: "#f8f9fa"
            }}
          >
            Cancel
          </Link>
          
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "12px 20px",
              backgroundColor: isSubmitting ? "#ccc" : "#5C6AC4",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontWeight: "500",
              cursor: isSubmitting ? "not-allowed" : "pointer"
            }}
          >
            {isSubmitting ? "Saving..." : "Save Rule"}
          </button>
        </div>
      </Form>
    </div>
  );
}
