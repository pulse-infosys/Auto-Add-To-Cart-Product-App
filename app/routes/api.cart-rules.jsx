import { json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import  prisma  from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (!shop) {
    return json({ error: "Shop parameter required" }, { status: 400 });
  }

  const rules = await prisma.cartRule.findMany({
    where: { 
      shop: shop,
      isActive: true 
    }
  });

  const response = json({ rules });
  return await cors(request, response);
}

export async function action({ request }) {
  const { ruleId, sessionId, cartId, shop } = await request.json();
  
  // Track rule execution
  await prisma.ruleExecution.create({
    data: {
      ruleId,
      shop,
      sessionId,
      cartId,
      executed: true
    }
  });

  const response = json({ success: true });
  return await cors(request, response);
}
