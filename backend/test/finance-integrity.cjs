// Financial regressions use only the in-memory Apps Script/Sheets harness.
const fs = require('node:fs');
const path = require('node:path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `{
sandbox.setupDatabase();
const assert = require('node:assert/strict');
const token = call('login', {username:'admin', password:'admin123'}).data.token;
const Q = (action, payload={}) => { const r=call(action,payload,token); assert(r.ok, action+': '+r.error); return r.data; };
let checks=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const near=(actual,expected,label)=>{assert(Math.abs(actual-expected)<0.006,label+': '+actual+' vs '+expected);checks++;};
const rejected=(action,payload,fragment)=>{const r=call(action,payload,token);assert(!r.ok,action+' must reject');assert(r.error.toLowerCase().includes(fragment.toLowerCase()),r.error);checks++;return r;};
const supplier=Q('supplier.save',{name:'Finance regression supplier'});
const cash=Q('bootstrap').accounts[0];
const product=(name,extra={})=>Q('product.save',{name,unit:'pcs',sale_price:300,...extra});
const buy=(pr,qty,cost,extra={})=>Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:pr.id,qty,cost,...extra}],payments:[]});
const sell=(pr,qty,extra={})=>Q('sale.create',{items:[{product_id:pr.id,qty,price:300,...extra}],payments:[{account_id:cash.id,amount:qty*300}]});
const prod=(pr)=>Q('products.list').find(x=>x.id===pr.id);
const state=(pr)=>{const p=prod(pr);return[p.stock,p.cost_price];};
const undo=(type,id)=>Q('reverse',{type,id,reason:'Finance regression',password:'admin123'});
const preturn=(pur,item,qty,serials)=>Q('preturn.create',{purchase_id:pur.purchase.id,items:[{purchase_item_id:item.id,qty,serials}],refund:{mode:'adjust'}});
const sreturn=(sale,item,qty,serials)=>Q('sreturn.create',{sale_id:sale.sale.id,items:[{sale_item_id:item.id,qty,serials}],refund:{account_id:cash.id}});
const snapshot=(pr)=>JSON.stringify({stock:state(pr),cash:Q('accounts.list').find(x=>x.id===cash.id).balance,sup:Q('suppliers.list').find(x=>x.id===supplier.id).balance,returns:sandbox.all_('SalesReturns').length,preturns:sandbox.all_('PurchaseReturns').length});

// Duplicate lines, repeated serials and fractional pieces must never change stock or money.
const p=product('Return line validation');const b=buy(p,2,100),s=sell(p,2);let before=snapshot(p);
rejected('sreturn.create',{sale_id:s.sale.id,items:[{sale_item_id:s.items[0].id,qty:2},{sale_item_id:s.items[0].id,qty:2}],refund:{account_id:cash.id}},'duplicate');
eq(snapshot(p),before,'duplicate sales return is side-effect free');
rejected('sreturn.create',{sale_id:s.sale.id,items:[{sale_item_id:s.items[0].id,qty:.5}],refund:{account_id:cash.id}},'whole number');
eq(snapshot(p),before,'fractional piece return is side-effect free');
sreturn(s,s.items[0],2);before=snapshot(p);
rejected('sreturn.create',{sale_id:s.sale.id,items:[{sale_item_id:s.items[0].id,qty:1}],refund:{account_id:cash.id}},'exceeds');
eq(snapshot(p),before,'prior returns are counted');
rejected('preturn.create',{purchase_id:b.purchase.id,items:[{purchase_item_id:b.items[0].id,qty:2},{purchase_item_id:b.items[0].id,qty:2}],refund:{mode:'adjust'}},'duplicate');
eq(snapshot(p),before,'duplicate purchase return is side-effect free');
rejected('preturn.create',{purchase_id:b.purchase.id,items:[{purchase_item_id:b.items[0].id,qty:.5}],refund:{mode:'adjust'}},'whole number');
eq(snapshot(p),before,'fractional supplier piece return is side-effect free');

const multi=product('Aggregate return stock');
const mb=Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:multi.id,qty:2,cost:100},{product_id:multi.id,qty:2,cost:100}],payments:[]});
sell(multi,1);before=snapshot(multi);
rejected('preturn.create',{purchase_id:mb.purchase.id,items:mb.items.map(i=>({purchase_item_id:i.id,qty:2})),refund:{mode:'adjust'}},'only');
eq(snapshot(multi),before,'different lines for one product share the same stock limit');

const serial=product('Serial return validation',{has_warranty:true,warranty_type:'serial',warranty_days:90});
const sb=buy(serial,2,100,{serials:['F-A','F-B']}),ss=sell(serial,2,{serials:['F-A','F-B']});before=snapshot(serial);
rejected('sreturn.create',{sale_id:ss.sale.id,items:[{sale_item_id:ss.items[0].id,qty:2,serials:['F-A','F-A']}],refund:{account_id:cash.id}},'duplicate serial');
eq(snapshot(serial),before,'duplicate serial customer return is side-effect free');
sreturn(ss,ss.items[0],2,['F-A','F-B']);before=snapshot(serial);
rejected('preturn.create',{purchase_id:sb.purchase.id,items:[{purchase_item_id:sb.items[0].id,qty:2,serials:['F-A','F-A']}],refund:{mode:'adjust'}},'duplicate serial');
eq(snapshot(serial),before,'duplicate supplier serial return is side-effect free');

// Fractional cable lengths remain valid; only piece units are constrained.
const cable=product('Decimal return cable',{unit:'meter'}),cb=buy(cable,10.5,100),cs=sell(cable,1.5);
near(sreturn(cs,cs.items[0],.5).return.total,150,'fractional sales return value');
eq(prod(cable).stock,9.5,'fractional sales return stock');
near(preturn(cb,cb.items[0],.5).return.total,50,'fractional purchase return value');
eq(prod(cable).stock,9,'fractional supplier return stock');

// Returning a specific purchase removes its own cost, not the current average.
const value=product('Purchase return valuation');buy(value,10,100);const vb=buy(value,10,200);
const vr=preturn(vb,vb.items[0],10);eq(state(value),[10,100],'return removes 2000 cost layer');
undo('preturn',vr.return.id);eq(state(value),[20,150],'immediate supplier return reversal restores exact average');
const vr2=preturn(vb,vb.items[0],10);buy(value,10,300);eq(state(value),[20,200]);
undo('preturn',vr2.return.id);eq(state(value),[30,200],'return cancellation blends original removed cost after later buy');

const cancel=product('Old sale cancellation');buy(cancel,10,100);const canceledSale=sell(cancel,10);buy(cancel,10,200);
undo('sale',canceledSale.sale.id);eq(state(cancel),[20,150],'old sold cost is restored instead of current cost');

// If later sales consumed a historical cost layer, reject impossible valuations.
const dependency=product('Consumed cost dependency');buy(dependency,10,100);const db=buy(dependency,10,200);sell(dependency,10);before=snapshot(dependency);
rejected('preturn.create',{purchase_id:db.purchase.id,items:[{purchase_item_id:db.items[0].id,qty:10}],refund:{mode:'adjust'}},'later inventory');
eq(snapshot(dependency),before,'cost-layer dependency failure leaves all balances unchanged');

// A serial re-purchase is a different stock record. Old return cancellation must be blocked.
const reuse=product('Re-purchased serial',{has_warranty:true,warranty_type:'serial',warranty_days:90});
const rb=buy(reuse,1,100,{serials:['F-REUSE']}),rr=preturn(rb,rb.items[0],1,['F-REUSE']);
const newBuy=buy(reuse,1,200,{serials:['F-REUSE']});before=snapshot(reuse);
rejected('reverse',{type:'preturn',id:rr.return.id,reason:'Blocked serial reuse',password:'admin123'},'moved again');
eq(snapshot(reuse),before,'old supplier return cannot double-count the replacement purchase');
eq(sandbox.all_('SerialItems').filter(x=>x.product_id===reuse.id&&x.status==='in_stock').length,1);
undo('purchase',newBuy.purchase.id);undo('preturn',rr.return.id);eq(state(reuse),[1,100],'undo later purchase then restore original serial safely');
eq(sandbox.all_('SerialItems').filter(x=>x.product_id===reuse.id&&x.status==='in_stock').length,1);

const chain=product('Sales return serial dependency',{has_warranty:true,warranty_type:'serial',warranty_days:90});
buy(chain,1,100,{serials:['F-CHAIN']});const chainSale=sell(chain,1,{serials:['F-CHAIN']}),chainReturn=sreturn(chainSale,chainSale.items[0],1,['F-CHAIN']);
const soldAgain=sell(chain,1,{serials:['F-CHAIN']}),returnedAgain=sreturn(soldAgain,soldAgain.items[0],1,['F-CHAIN']);before=snapshot(chain);
rejected('reverse',{type:'sreturn',id:chainReturn.return.id,reason:'Blocked later sale',password:'admin123'},'later inventory');
eq(snapshot(chain),before,'serial return reversal does not steal a later sale-return record');
undo('sreturn',returnedAgain.return.id);undo('sale',soldAgain.sale.id);undo('sreturn',chainReturn.return.id);eq(prod(chain).stock,0);

// Purchase discounts are allocated into inventory and hence sold cost/profit.
const discount=product('Net discounted inventory');
const discounted=Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:discount.id,qty:10,cost:100}],discount:100,payments:[]});
eq(state(discount),[10,90]);eq(discounted.items[0].cost,100,'supplier invoice unit cost is still displayed gross');
eq(JSON.parse(discounted.items[0].valuation).inventory_cost,900);
const ds=sell(discount,10);eq([ds.sale.total,ds.sale.cost,ds.sale.profit],[3000,900,2100]);
undo('sale',ds.sale.id);eq(state(discount),[10,90]);
const dr=preturn(discounted,discounted.items[0],4);eq(dr.return.total,360);eq(state(discount),[6,90]);
undo('preturn',dr.return.id);eq(state(discount),[10,90]);undo('purchase',discounted.purchase.id);eq(prod(discount).stock,0);

// Cumulative allocations avoid minting cents during partial serial returns.
const cents=product('Serial discount rounding',{has_warranty:true,warranty_type:'serial',warranty_days:90});
const centBuy=Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:cents.id,qty:3,cost:10.01,serials:['F-C1','F-C2','F-C3']}],discount:.01,payments:[]});
near(sandbox.all_('SerialItems').filter(x=>x.product_id===cents.id).reduce((n,x)=>n+x.cost,0),30.02,'serial costs sum to exact discounted payable');
const cr=[];for(const sn of ['F-C1','F-C2','F-C3'])cr.push(preturn(centBuy,centBuy.items[0],1,[sn]));
near(cr.reduce((n,x)=>n+x.return.total,0),30.02,'three partial refunds cannot exceed the 30.02 invoice');eq(prod(cents).stock,0);
for(const r of cr.slice().reverse())undo('preturn',r.return.id);eq(prod(cents).stock,3);
const centSale=sell(cents,3,{serials:['F-C1','F-C2','F-C3']});eq(centSale.sale.cost,30.02);
const csr=[];for(const sn of ['F-C1','F-C2','F-C3'])csr.push(sreturn(centSale,centSale.items[0],1,[sn]));
near(csr.reduce((n,x)=>n+x.return.cost,0),30.02,'partial returns preserve 4-decimal original serial costs');

const customerCents=product('Sale discount rounding');buy(customerCents,3,1);
const cms=Q('sale.create',{items:[{product_id:customerCents.id,qty:3,price:5}],discount:.01,payments:[{account_id:cash.id,amount:14.99}]});
const cmr=[sreturn(cms,cms.items[0],1),sreturn(cms,cms.items[0],1),sreturn(cms,cms.items[0],1)];
near(cmr.reduce((n,x)=>n+x.return.total,0),14.99,'partial customer refunds sum to exact sale total');

// Legacy purchases already booked gross cost must not be silently repriced by the update.
const legacy=product('Legacy gross purchase');const lb=Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:legacy.id,qty:10,cost:100}],discount:100,payments:[]});
sandbox.update_('PurchaseItems',lb.items[0].id,{valuation:''});sandbox.update_('Products',legacy.id,{cost_price:100});
const lr=preturn(lb,lb.items[0],2);eq(lr.return.total,180);eq(state(legacy),[8,100],'legacy gross cost remains gross');
undo('preturn',lr.return.id);eq(state(legacy),[10,100]);

// A pre-update purchase return changed stock only; cancel it using that actual bookkeeping.
const legacyReturn=product('Legacy supplier return');buy(legacyReturn,10,100);const lrb=buy(legacyReturn,10,200),lrr=preturn(lrb,lrb.items[0],10);
sandbox.all_('PurchaseReturnItems').filter(x=>x.return_id===lrr.return.id).forEach(x=>sandbox.update_('PurchaseReturnItems',x.id,{valuation:''}));
sandbox.update_('Products',legacyReturn.id,{cost_price:150});undo('preturn',lrr.return.id);eq(state(legacyReturn),[20,150]);

// Fully discounted goods still have a physical return even when no money changes hands.
const free=product('Fully discounted stock');const fb=Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:free.id,qty:2,cost:100}],discount:200,payments:[]});
eq(state(free),[2,0]);const fsale=Q('sale.create',{items:[{product_id:free.id,qty:1,price:300}],discount:300,payments:[]});
eq(sreturn(fsale,fsale.items[0],1).return.refund,0);eq(prod(free).stock,2);
eq(preturn(fb,fb.items[0],1).return.total,0);eq(state(free),[1,0]);

console.log('Finance integrity: '+checks+' checks passed');
}
`;
new Function('require', '__dirname', harness + scenario)(require, __dirname);
