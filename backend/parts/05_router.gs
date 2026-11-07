/* ============================================================================
 *  22. API ROUTER
 *      r(perm, handler, isWrite)   perm = null → any signed-in user
 * ========================================================================== */
function r_(perm, fn, write) { return { perm: perm, fn: fn, write: !!write }; }

var ROUTES = {
  ping:               { public: true, fn: function () { return { app: 'Karvio', version: APP_VERSION, time: now_() }; } },
  login:              { public: true, fn: login_, write: false },
  logout:             r_(null, logout_),
  'password.change':  r_(null, changePassword_, true),
  bootstrap:          r_(null, bootstrap_),

  'products.list':    r_(null, function (p, u) { return productsList_(u); }),
  'product.save':     r_('products', productSave_, true),
  'product.delete':   r_('products', productDelete_, true),
  'serials.list':     r_(null, serialsList_),
  'stock.adjust':     r_('products', stockAdjust_, true),
  'master.save':      r_('products', masterSave_, true),
  'master.delete':    r_('products', masterDelete_, true),

  'customers.list':   r_(null, function () { return customersList_(); }),
  'customer.save':    r_(null, function (p, u) { if (!p.id && !can_(u, 'customers') && !can_(u, 'pos')) fail_('Permission denied'); return customerSave_(p, u); }, true),
  'customer.quickAdd':r_('pos', customerQuickAdd_, true),
  'customer.statement': r_('customers', customerStatement_),
  'customer.payment': r_('customers', customerPayment_, true),
  'suppliers.list':   r_('suppliers', function () { return suppliersList_(); }),
  'supplier.save':    r_('suppliers', supplierSave_, true),
  'supplier.statement': r_('suppliers', supplierStatement_),
  'supplier.payment': r_('suppliers', supplierPayment_, true),

  'accounts.list':    r_('accounts', function () { return accountsList_(); }),
  'account.save':     r_('accounts', accountSave_, true),
  'account.entry':    r_('accounts', accountEntry_, true),
  'account.ledger':   r_('accounts', accountLedger_),

  'purchase.create':  r_('purchase', purchaseCreate_, true),
  'purchase.detail':  r_('purchase', purchaseDetail_),
  'purchases.list':   r_('purchase', purchasesList_),
  'preturn.create':   r_('purchase', preturnCreate_, true),
  'preturns.list':    r_('purchase', preturnsList_),

  'sale.create':      r_('pos', saleCreate_, true),
  'sale.detail':      r_('pos', saleDetail_),
  'sales.list':       r_('pos', salesList_),
  'sreturn.create':   r_('sales.return', sreturnCreate_, true),
  'sreturns.list':    r_('sales.return', sreturnsList_),

  'expense.create':   r_('expenses', expenseCreate_, true),
  'expenses.list':    r_('expenses', expensesList_),

  'reverse':          r_('cancel', reverse_, true),

  'warranty.lookup':  r_('warranty', warrantyLookup_),
  'claim.create':     r_('warranty', claimCreate_, true),
  'claim.update':     r_('warranty', claimUpdate_, true),
  'claims.list':      r_('warranty', claimsList_),

  'history':          r_(null, itemHistory_),
  'dashboard':        r_(null, dashboard_),
  'reports':          r_('reports', reports_),

  'users.list':       r_('users', usersList_),
  'user.save':        r_('users', userSave_, true),
  'rolePerms.save':   r_('users', rolePermsSave_, true),
  'settings.get':     r_(null, settingsGet_),
  'settings.save':    r_('settings', settingsSave_, true),
  'sms.test':         r_('settings', smsTest_),
  'sms.log':          r_('settings', smsLog_)
};

function doGet() {
  return json_({ ok: true, data: { app: 'Karvio', version: APP_VERSION, message: 'Karvio API is running. Send POST requests (text/plain JSON body).' } });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Invalid JSON body' }); }
  try {
    var route = ROUTES[req.action];
    if (!route) fail_('Unknown action: ' + req.action);
    var user = null;
    if (!route.public) {
      user = authUser_(req.token);
      need_(user, route.perm);
    }
    var run = function () { return route.fn(req.payload || {}, user, req.token); };
    var data = route.write ? withLock_(run) : run();
    return json_({ ok: true, data: data });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    return json_({ ok: false, error: msg.replace(/^Error:\s*/, ''), auth: msg.indexOf('AUTH:') === 0 });
  }
}
