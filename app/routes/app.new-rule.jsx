import { json } from "@remix-run/node";
import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma  from "../db.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  
  const rules = await prisma.cartRule.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  return json({ rules, shop: session.shop });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const ruleId = formData.get("ruleId");

  if (action === "toggle") {
    await prisma.cartRule.update({
      where: { id: ruleId },
      data: { isActive: !formData.get("isActive") === "true" }
    });
  } else if (action === "delete") {
    await prisma.cartRule.delete({
      where: { id: ruleId }
    });
  }

  return json({ success: true });
}

export default function Index() {
    
  const { rules } = useLoaderData();
  const fetcher = useFetcher();

  const toggleRule = (rule) => {
    fetcher.submit(
      { action: "toggle", ruleId: rule.id, isActive: rule.isActive },
      { method: "post" }
    );
  };

  const deleteRule = (ruleId) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      fetcher.submit(
        { action: "delete", ruleId },
        { method: "post" }
      );
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>Cart Rules</h1>
        <Link
          to="/rules/new"
          style={{
            backgroundColor: "#5C6AC4",
            color: "white",
            padding: "12px 20px",
            textDecoration: "none",
            borderRadius: "6px",
            fontWeight: "500"
          }}
        >
          Create New Rule
        </Link>
      </div>

      {rules.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
          <h2 style={{ color: "#666", marginBottom: "10px" }}>No rules created yet</h2>
          <p style={{ color: "#999", marginBottom: "20px" }}>Create your first cart rule to automatically add products based on cart value.</p>
          <Link
            to="/rules/new"
            style={{
              backgroundColor: "#5C6AC4",
              color: "white",
              padding: "12px 20px",
              textDecoration: "none",
              borderRadius: "6px",
              fontWeight: "500"
            }}
          >
            Create Your First Rule
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {rules.map((rule) => (
            <div key={rule.id} style={{
              border: "1px solid #e1e5e9",
              borderRadius: "8px",
              padding: "20px",
              backgroundColor: "white"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: "18px" }}>{rule.name}</h3>
                  <p style={{ margin: "0 0 12px 0", color: "#666" }}>
                    Min Cart Value: ₹{rule.minCartValue}
                    {rule.hasUpperLimit && ` - Max: ₹${rule.maxCartValue}`}
                  </p>
                  
                  <div style={{ display: "flex", gap: "12px", fontSize: "14px", color: "#888" }}>
                    {rule.worksInReverse && <span>↩ Reverse</span>}
                    {rule.allowMultipleTriggers && <span>🔄 Multiple</span>}
                    {rule.executeOncePerSession && <span>1️⃣ Once/Session</span>}
                    {rule.preventQuantityChanges && <span>🔒 Locked Qty</span>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    onClick={() => toggleRule(rule)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      backgroundColor: rule.isActive ? "#d4edda" : "#f8d7da",
                      color: rule.isActive ? "#155724" : "#721c24",
                      cursor: "pointer"
                    }}
                  >
                    {rule.isActive ? "Active" : "Inactive"}
                  </button>
                  
                  <Link
                    to={`/rules/${rule.id}/edit`}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #007bff",
                      borderRadius: "4px",
                      color: "#007bff",
                      textDecoration: "none"
                    }}
                  >
                    Edit
                  </Link>
                  
                  <button
                    onClick={() => deleteRule(rule.id)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #dc3545",
                      borderRadius: "4px",
                      backgroundColor: "#dc3545",
                      color: "white",
                      cursor: "pointer"
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}