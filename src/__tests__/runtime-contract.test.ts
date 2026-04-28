import { describe, expect, it } from 'vitest';
import {
  buildRuntimeContextPacket,
  buildRuntimeScope,
  buildRuntimeSystemPrompt,
  predictRuntimeBottlenecks,
  summarizeRuntimeScope,
  verifyRuntimeAnswer,
} from '../runtime-contract';

describe('runtime contract planner', () => {
  it('scopes POS reconciliation to CRM, POS, and Accounting tools', () => {
    const scope = buildRuntimeScope(
      'Why did customer ABC pay in POS but still show unpaid in accounting?',
      'org_123',
    );

    expect(scope.domains).toEqual(expect.arrayContaining(['crm', 'pos', 'accounting']));
    expect(scope.objects).toEqual(expect.arrayContaining(['Customer', 'Payment', 'Invoice']));
    expect(scope.allowedTools).toEqual(
      expect.arrayContaining([
        'crm_customer_lookup',
        'pos_transaction_search',
        'accounting_invoice_search',
        'accounting_payment_match',
      ]),
    );
    expect(scope.blockedDomains).toEqual(expect.arrayContaining(['payroll', 'hr']));
    expect(scope.riskLevel).toBe('medium');
    expect(scope.requiresApproval).toBe(false);
    expect(summarizeRuntimeScope(scope)).toContain('CRM'.toLowerCase());
  });

  it('builds a citable runtime packet and verifier-friendly prompt', () => {
    const scope = buildRuntimeScope('Show me the status of invoice 456', 'org_123');
    const packet = buildRuntimeContextPacket(scope, [
      { source: 'accounting', text: 'invoice inv_456 is unpaid' },
    ]);
    const prompt = buildRuntimeSystemPrompt('Base prompt', packet);

    expect(packet.evidence).toHaveLength(1);
    expect(prompt).toContain('Allowed tools');
    expect(prompt).toContain('invoice inv_456 is unpaid');
  });

  it('predicts bottlenecks for slow or broad execution paths', () => {
    const scope = buildRuntimeScope(
      'Compare the customer payment in POS with accounting and create a reconciliation task',
      'org_123',
    );
    const packet = buildRuntimeContextPacket(scope, []);
    packet.context_health = { tasks: 'error', crossSession: 'missing' };

    const bottlenecks = predictRuntimeBottlenecks(scope, packet, {
      researchMs: 3200,
      planningMs: 1800,
      firstTokenMs: 6200,
      compareModelCount: 3,
      attachedFiles: 2,
    });

    expect(bottlenecks.map((item) => item.stage)).toEqual(
      expect.arrayContaining(['research', 'planning', 'router']),
    );
    expect(bottlenecks.some((item) => item.reason.includes('Evidence retrieval is slow'))).toBe(
      true,
    );
  });

  it('flags a simple read query as non-approval work', () => {
    const scope = buildRuntimeScope('Show me the status of invoice 456', 'org_123');
    const verdict = verifyRuntimeAnswer('Invoice is unpaid.', buildRuntimeContextPacket(scope, []));

    expect(scope.actionMode).toBe('read');
    expect(scope.requiresApproval).toBe(false);
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toContain('no_evidence_loaded');
  });
});
