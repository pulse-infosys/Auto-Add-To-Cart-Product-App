import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getRules(shop) {
  return await prisma.rule.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createRule(shop, ruleData) {
  return await prisma.rule.create({
    data: {
      shop,
      ...ruleData
    }
  });
}

export async function updateRule(id, shop, ruleData) {
  return await prisma.rule.update({
    where: { id, shop },
    data: ruleData
  });
}

export async function deleteRule(id, shop) {
  return await prisma.rule.delete({
    where: { id, shop }
  });
}

export async function getActiveRules(shop) {
  return await prisma.rule.findMany({
    where: { 
      shop, 
      status: 'active' 
    }
  });
}

export async function logRuleExecution(ruleId, customerId, sessionId, cartToken) {
  return await prisma.ruleExecution.create({
    data: {
      ruleId,
      customerId,
      sessionId,
      cartToken
    }
  });
}

export async function hasRuleExecuted(ruleId, customerId, sessionId) {
  const execution = await prisma.ruleExecution.findFirst({
    where: {
      ruleId,
      OR: [
        { customerId },
        { sessionId }
      ]
    }
  });
  return !!execution;
}