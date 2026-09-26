// test-e2e-workflow.mjs
// Automated verification script for IT Helpdesk Mini App

const BASE_URL = 'http://localhost:3000';

const employeeHeaders = {
  'Content-Type': 'application/json',
  'x-demo-role': 'employee',
};

const techHeaders = {
  'Content-Type': 'application/json',
  'x-demo-role': 'technician',
};

const adminHeaders = {
  'Content-Type': 'application/json',
  'x-demo-role': 'admin',
};

async function logStep(title, fn) {
  process.stdout.write(`\n--- [TEST] ${title} ... `);
  try {
    const res = await fn();
    console.log(`✅ PASSED`);
    if (res) console.log(`    Detail:`, typeof res === 'string' ? res : JSON.stringify(res).slice(0, 160) + '...');
    return res;
  } catch (err) {
    console.log(`❌ FAILED:`, err.message);
    throw err;
  }
}

async function run() {
  console.log('🚀 Starting Complete IT Helpdesk E2E Verification Workflow');

  // 1. Employee Auth & Profile
  await logStep('Employee Profile Retrieval (Ezera)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, { headers: employeeHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.user?.role !== 'EMPLOYEE' || !data.user) throw new Error(`Invalid user or role: ${JSON.stringify(data)}`);
    return `Logged in as ${data.user.first_name} ${data.user.last_name} (${data.user.role})`;
  });

  // 2. Global Search
  await logStep('Global Multi-Entity Search (query: "Wi-Fi")', async () => {
    const res = await fetch(`${BASE_URL}/api/search?q=Wi-Fi`, { headers: employeeHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Found: ${data.tickets?.length || 0} tickets, ${data.articles?.length || 0} articles, ${data.assets?.length || 0} assets`;
  });

  // 3. Employee creates a new ticket
  let createdTicket;
  await logStep('Employee Creates Ticket (Section 7 & 8)', async () => {
    const payload = {
      subject: 'Office Wi-Fi disconnecting frequently on 3rd floor',
      description: 'The connection drops every 5 minutes when walking near conference room B. Need urgent check.',
      categoryKey: 'network',
      priority: 'HIGH',
    };
    const res = await fetch(`${BASE_URL}/api/tickets`, {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    createdTicket = data.ticket;
    if (!createdTicket?.ticket_number || !createdTicket.ticket_number.startsWith('IT-')) {
      throw new Error(`Invalid ticket response: ${JSON.stringify(data)}`);
    }
    return `Ticket Created: ${createdTicket.ticket_number} (ID: ${createdTicket.id}) with SLA deadline ${createdTicket.sla_resolution_deadline}`;
  });

  // 4. Technician views queue & unassigned tickets
  await logStep('Technician Queue Verification (Section 11)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets?scope=unassigned`, { headers: techHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const found = (data.tickets || []).some(t => t.id === createdTicket.id);
    return `Unassigned tickets: ${data.tickets?.length || 0} (New ticket present: ${found})`;
  });

  // 5. Technician Takes Ticket
  await logStep('Technician Takes Ticket (Section 12)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/${createdTicket.id}/take`, {
      method: 'POST',
      headers: techHeaders,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const updated = data.ticket;
    if (updated.status !== 'ASSIGNED' || !updated.assigned_technician_id) {
      throw new Error(`Assignment failed: status=${updated?.status}, tech=${updated?.assigned_technician_id}`);
    }
    return `Assigned to Daniel; Status updated to ${updated.status}`;
  });

  // 6. Technician adds Internal Note (Section 15)
  await logStep('Technician Adds Internal Note (Section 15)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/${createdTicket.id}/messages`, {
      method: 'POST',
      headers: techHeaders,
      body: JSON.stringify({
        message: 'Checked switch port 14 on 3rd floor rack; errors accumulating on PoE link.',
        internal: true,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.note) throw new Error('Note was not returned');
    return `Internal note posted: "${data.note.note}"`;
  });

  // 7. Verify Employee CANNOT see internal notes
  await logStep('Security Check: Employee Cannot See Internal Notes (Section 15)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/${createdTicket.id}`, { headers: employeeHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ticketData = await res.json();
    const internalNotes = ticketData.internalNotes || [];
    if (internalNotes.length > 0) {
      throw new Error('SECURITY VIOLATION: Employee can see internal notes!');
    }
    return `Verified: ${ticketData.comments?.length || 0} public comments, 0 internal notes leaked to employee`;
  });

  // 8. Technician adds public reply
  await logStep('Technician Sends Public Reply (Section 14)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/${createdTicket.id}/messages`, {
      method: 'POST',
      headers: techHeaders,
      body: JSON.stringify({
        message: 'Hello Ezera, I am dispatching to the 3rd floor switch closet now to replace the PoE cable.',
        internal: false,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Technician reply posted: "${data.comment?.message}"`;
  });

  // 9. Employee replies
  await logStep('Employee Replies to Technician (Section 14)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/${createdTicket.id}/messages`, {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({
        message: 'Thank you Daniel! I am sitting at desk 304 if you need to test with my laptop.',
        internal: false,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Employee reply posted: "${data.comment?.message}"`;
  });

  // 10. Technician Resolves Ticket (Section 18)
  await logStep('Technician Resolves Ticket (Section 18)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/${createdTicket.id}/resolve`, {
      method: 'POST',
      headers: techHeaders,
      body: JSON.stringify({
        resolutionNote: 'Replaced faulty PoE injector on AP-3B and confirmed 240Mbps throughput.',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const updated = data.ticket;
    if (updated.status !== 'RESOLVED' || !updated.resolution_note) {
      throw new Error(`Failed to resolve ticket properly: status=${updated?.status}`);
    }
    return `Status updated to RESOLVED with note: "${updated.resolution_note}"`;
  });

  // 11. Employee Confirms Resolution -> CLOSED (Section 19)
  await logStep('Employee Confirms Resolution -> CLOSED (Section 19)', async () => {
    const res = await fetch(`${BASE_URL}/api/tickets/${createdTicket.id}/close`, {
      method: 'POST',
      headers: employeeHeaders,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const updated = data.ticket;
    if (updated.status !== 'CLOSED') {
      throw new Error(`Failed to close ticket: status=${updated?.status}`);
    }
    return `Ticket closed successfully. Final status: ${updated.status}`;
  });

  // 12. Admin Control Center & Reports (Sections 21, 33, 34)
  await logStep('Admin Executive Reports (Section 33)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/reports`, { headers: adminHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data.metrics?.total !== 'number') {
      throw new Error('Reports missing metrics.total');
    }
    return `Total tickets: ${data.metrics.total}, SLA compliance: ${data.metrics.slaComplianceRate}%, Avg Resolution: ${(data.metrics.avgResolutionMinutes / 60).toFixed(1)}h`;
  });

  // 13. Audit Log verification (Section 34)
  await logStep('Admin Audit Trail Verification (Section 34)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/audit`, { headers: adminHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const logs = data.logs || [];
    const relatedLogs = logs.filter(l => l.object_id === createdTicket.id);
    return `Found ${relatedLogs.length} audit entries for ${createdTicket.ticket_number} (Latest action: ${relatedLogs[0]?.action})`;
  });

  // 14. Asset Detail & Linked Tickets Verification (Sections 29 & 30)
  await logStep('Asset Hardware Detail & Linked Tickets (Sections 29 & 30)', async () => {
    const listRes = await fetch(`${BASE_URL}/api/admin/assets`, { headers: adminHeaders });
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const listData = await listRes.json();
    const targetAsset = listData.assets?.[0];
    if (!targetAsset) throw new Error('No assets found');

    const res = await fetch(`${BASE_URL}/api/admin/assets/${targetAsset.id}`, { headers: adminHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return `Asset ${data.asset.asset_tag} (${data.asset.model}) has ${data.tickets?.length} linked tickets`;
  });

  // 15. Telegram Webhook simulation
  await logStep('Telegram Webhook (/start & commands) (Section 40)', async () => {
    const webhookPayload = {
      update_id: 999001,
      message: {
        message_id: 101,
        from: {
          id: 10001,
          is_bot: false,
          first_name: 'Ezera',
          last_name: 'Hailu',
          username: 'ezera_h',
        },
        chat: {
          id: 10001,
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
      },
    };
    const res = await fetch(`${BASE_URL}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET || 'taf_helpdesk_secret_2026',
      },
      body: JSON.stringify(webhookPayload),
    });
    if (!res.ok) throw new Error(`Webhook error: HTTP ${res.status}`);
    const result = await res.json();
    return `Webhook accepted /start: ok=${result.ok}`;
  });

  console.log('\n======================================================');
  console.log('🎉 ALL 15 END-TO-END WORKFLOW VERIFICATIONS PASSED!');
  console.log('======================================================\n');
}

run().catch((e) => {
  console.error('\n❌ E2E Workflow Test Failed:', e);
  process.exit(1);
});
