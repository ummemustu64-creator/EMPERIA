const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(PUBLIC, 'uploads', 'products');
const MEDIA = path.join(PUBLIC, 'uploads', 'media');
const ASSETS = path.join(PUBLIC, 'assets');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const sessions = new Map();

const files = {
  products: path.join(DATA, 'products.json'), settings: path.join(DATA, 'settings.json'),
  enquiries: path.join(DATA, 'enquiries.json'), projects: path.join(DATA, 'projects.json'),
  customers: path.join(DATA, 'customers.json'), quotes: path.join(DATA, 'quotes.json'),
  orders: path.join(DATA, 'orders.json'), inventory: path.join(DATA, 'inventory.json'),
  users: path.join(DATA, 'users.json'), activity: path.join(DATA, 'activity.json'), analytics: path.join(DATA, 'analytics.json')
};
for (const d of [DATA, UPLOADS, MEDIA, ASSETS]) fs.mkdirSync(d, { recursive: true });
const defaults = { enquiries: [], projects: [], customers: [], quotes: [], orders: [], inventory: [], users: [], activity: [], analytics: [] };
for (const [k, initial] of Object.entries(defaults)) if (!fs.existsSync(files[k])) fs.writeFileSync(files[k], JSON.stringify(initial, null, 2));

// Seed inventory rows for existing catalogue products without inventing stock quantities.
const existingProducts = readJson(files.products, []);
const existingInventory = readJson(files.inventory, []);
let inventoryChanged = false;
for (const p of existingProducts) {
  if (!existingInventory.some(x => x.productId === p.id)) { existingInventory.push({ id: crypto.randomUUID(), productId: p.id, sku: p.sku || p.id, stock: 0, reserved: 0, lowStock: 5, warehouse: 'Main', incoming: 0, updatedAt: now() }); inventoryChanged = true; }
}
if (inventoryChanged) writeJson(files.inventory, existingInventory);

app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC));
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function safeId(v) { return String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70); }
function baseProduct(p) { return { ...p, images: Array.isArray(p.images) ? p.images : [], variations: Array.isArray(p.variations) ? p.variations : [] }; }
function now() { return new Date().toISOString(); }
function actor(req) { return sessions.get(req.headers.authorization?.replace('Bearer ', '')) || { id: 'master', name: 'Master Admin', role: 'Owner' }; }
function auth(req, res, next) { const t = req.headers.authorization?.replace('Bearer ', ''); if (!t || !sessions.has(t)) return res.status(401).json({ error: 'Unauthorized' }); req.admin = actor(req); next(); }
function role(...allowed) { return (req, res, next) => allowed.includes(req.admin?.role) ? next() : res.status(403).json({ error: 'Permission denied' }); }
function activity(req, action, entity, entityId, details = '') { const a = readJson(files.activity, []); a.unshift({ id: crypto.randomUUID(), createdAt: now(), actor: req.admin?.name || 'Admin', action, entity, entityId, details }); writeJson(files.activity, a.slice(0, 1000)); }
function hashPassword(p) { return crypto.scryptSync(String(p), 'emperia-admin-salt-v1', 64).toString('hex'); }
function customerFor(body) {
  const all = readJson(files.customers, []); const email = String(body.email || '').trim().toLowerCase(); const phone = String(body.phone || '').replace(/\D/g, '');
  let c = all.find(x => email && x.email?.toLowerCase() === email) || all.find(x => phone && String(x.phone || '').replace(/\D/g, '') === phone);
  if (!c) { c = { id: crypto.randomUUID(), name: body.name || 'Unknown', company: body.company || '', email: body.email || '', phone: body.phone || '', createdAt: now(), notes: '', tags: [] }; all.unshift(c); }
  else { c.name = body.name || c.name; c.company = body.company || c.company; c.email = body.email || c.email; c.phone = body.phone || c.phone; c.updatedAt = now(); }
  writeJson(files.customers, all); return c;
}

const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, UPLOADS), filename: (req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase(); const stem = safeId(path.basename(file.originalname, ext)) || 'image'; cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${stem}${ext}`); } });
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024, files: 20 }, fileFilter: (req, file, cb) => { const ok = ['.jpg','.jpeg','.png','.webp','.gif'].includes(path.extname(file.originalname).toLowerCase()); cb(ok ? null : new Error('Only JPG, JPEG, PNG, WEBP and GIF images are allowed.'), ok); } });
const mediaStorage = multer.diskStorage({ destination: (req, file, cb) => cb(null, MEDIA), filename: (req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase(); const stem = safeId(path.basename(file.originalname, ext)) || 'media'; cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${stem}${ext}`); } });
const mediaUpload = multer({ storage: mediaStorage, limits: { fileSize: 12 * 1024 * 1024, files: 30 }, fileFilter: (req, file, cb) => { const ok = ['.jpg','.jpeg','.png','.webp','.gif'].includes(path.extname(file.originalname).toLowerCase()); cb(ok ? null : new Error('Only JPG, JPEG, PNG, WEBP and GIF images are allowed.'), ok); } });

app.get('/api/settings', (req,res)=>res.json(readJson(files.settings, {})));
app.get('/api/products', (req,res)=>res.json(readJson(files.products, []).map(baseProduct)));
app.get('/api/products/:id', (req,res)=>{ const p=readJson(files.products,[]).map(baseProduct).find(x=>x.id===req.params.id); if(!p)return res.status(404).json({error:'Product not found'}); res.json(p); });
app.get('/api/projects', (req,res)=>res.json(readJson(files.projects, [])));
app.post('/api/orders',(req,res)=>{
  const b=req.body||{}, rawItems=Array.isArray(b.items)?b.items:[];
  if(!String(b.name||'').trim()||!String(b.phone||'').trim()) return res.status(400).json({error:'Name and phone are required'});
  if(!rawItems.length) return res.status(400).json({error:'Your cart is empty'});
  const products=readJson(files.products,[]).map(baseProduct), items=[];
  for(const line of rawItems){const p=products.find(x=>x.id===line.productId),qty=Math.max(1,Math.min(10000,Number(line.quantity)||1));if(!p)continue;const unitPrice=Number(p.sellingPrice||0);items.push({productId:p.id,productName:p.name,sku:p.sku||p.id,quantity:qty,unitPrice,total:unitPrice*qty});}
  if(!items.length)return res.status(400).json({error:'No valid products were found in the cart'});
  const customer=customerFor(b),subtotal=items.reduce((n,x)=>n+x.total,0);
  const order={id:crypto.randomUUID(),orderNo:'WEB-'+String(Date.now()).slice(-8),customerId:customer.id,customerName:customer.name,company:customer.company||'',phone:customer.phone||'',email:customer.email||'',deliveryAddress:b.address||'',paymentMethod:b.paymentMethod||'To be confirmed',items,subtotal,discount:0,tax:0,total:subtotal,paymentStatus:'Pending',status:'New',deliveryStatus:'Pending',salesperson:'Unassigned',source:'Website Cart',notes:b.notes||'',pricingStatus:items.some(x=>x.unitPrice<=0)?'Requires confirmation':'Catalogue price',createdAt:now(),updatedAt:now()};
  const orders=readJson(files.orders,[]);orders.unshift(order);writeJson(files.orders,orders);res.json({ok:true,orderNo:order.orderNo,order});
});

app.get('/api/admin/media', auth, (req,res)=>{ const allowed=new Set(['.jpg','.jpeg','.png','.webp','.gif']); const out=fs.readdirSync(MEDIA,{withFileTypes:true}).filter(x=>x.isFile()&&allowed.has(path.extname(x.name).toLowerCase())).map(x=>{const p=path.join(MEDIA,x.name),st=fs.statSync(p);return{name:x.name,url:`/uploads/media/${encodeURIComponent(x.name)}`,size:st.size,updatedAt:st.mtime.toISOString()}}).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)); res.json(out); });
app.post('/api/admin/media',auth,mediaUpload.array('images',30),(req,res)=>res.json({ok:true,images:(req.files||[]).map(f=>({name:f.filename,url:`/uploads/media/${encodeURIComponent(f.filename)}`,size:f.size}))}));
app.delete('/api/admin/media',auth,(req,res)=>{const name=path.basename(String(req.body?.name||''));if(!name)return res.status(400).json({error:'Media filename is required'});const p=path.join(MEDIA,name);if(!fs.existsSync(p))return res.status(404).json({error:'Media file not found'});fs.unlinkSync(p);activity(req,'Deleted','Media',name);res.json({ok:true})});

app.post('/api/admin/login',(req,res)=>{ const email=String(req.body.email||'').trim().toLowerCase(); const password=String(req.body.password||''); let user=null; if(password===ADMIN_PASSWORD && !email) user={id:'master',name:'Master Admin',email:'',role:'Owner'}; else { const found=readJson(files.users,[]).find(u=>u.active!==false && u.email?.toLowerCase()===email); if(found && found.passwordHash===hashPassword(password)) user={id:found.id,name:found.name,email:found.email,role:found.role}; } if(!user)return res.status(401).json({error:'Incorrect credentials'});const token=crypto.randomBytes(32).toString('hex');sessions.set(token,user);res.json({token,user}) });
app.post('/api/admin/logout',auth,(req,res)=>{sessions.delete(req.headers.authorization.replace('Bearer ',''));res.json({ok:true})});

app.post('/api/admin/products',auth,role('Owner','Admin','Content Manager'),(req,res)=>{const a=readJson(files.products,[]).map(baseProduct),b=req.body||{},id=safeId(b.id||b.name);if(!id||!b.name)return res.status(400).json({error:'Product name is required'});if(a.some(p=>p.id===id))return res.status(409).json({error:'Product ID already exists'});const p={id,name:b.name.trim(),sku:b.sku||id,category:b.category||'Uncategorized',tag:b.tag||'',description:b.description||'',seoTitle:b.seoTitle||'',seoDescription:b.seoDescription||'',specs:b.specs||{},images:Array.isArray(b.images)?b.images:[],variations:Array.isArray(b.variations)?b.variations:[],featured:!!b.featured,newArrival:!!b.newArrival,bestSeller:!!b.bestSeller,costPrice:Number(b.costPrice||0),sellingPrice:Number(b.sellingPrice||0),dealerPrice:Number(b.dealerPrice||0),gstRate:Number(b.gstRate||0),moq:Number(b.moq||1),leadTime:b.leadTime||'',createdAt:now()};a.push(p);writeJson(files.products,a);if(!readJson(files.inventory,[]).some(x=>x.productId===id)){const inv=readJson(files.inventory,[]);inv.push({id:crypto.randomUUID(),productId:id,sku:p.sku,stock:0,reserved:0,lowStock:5,warehouse:'Main',incoming:0,updatedAt:now()});writeJson(files.inventory,inv)}activity(req,'Created','Product',id,p.name);res.json(p)});
app.put('/api/admin/products/:id',auth,role('Owner','Admin','Content Manager'),(req,res)=>{const a=readJson(files.products,[]).map(baseProduct),i=a.findIndex(p=>p.id===req.params.id);if(i<0)return res.status(404).json({error:'Product not found'});const b=req.body||{};a[i]={...a[i],name:b.name??a[i].name,sku:b.sku??a[i].sku,category:b.category??a[i].category,tag:b.tag??a[i].tag,description:b.description??a[i].description,seoTitle:b.seoTitle??a[i].seoTitle,seoDescription:b.seoDescription??a[i].seoDescription,specs:b.specs??a[i].specs,images:Array.isArray(b.images)?b.images:a[i].images,variations:Array.isArray(b.variations)?b.variations:a[i].variations,featured:b.featured!==undefined?!!b.featured:a[i].featured,newArrival:b.newArrival!==undefined?!!b.newArrival:a[i].newArrival,bestSeller:b.bestSeller!==undefined?!!b.bestSeller:a[i].bestSeller,costPrice:b.costPrice!==undefined?Number(b.costPrice):a[i].costPrice,sellingPrice:b.sellingPrice!==undefined?Number(b.sellingPrice):a[i].sellingPrice,dealerPrice:b.dealerPrice!==undefined?Number(b.dealerPrice):a[i].dealerPrice,gstRate:b.gstRate!==undefined?Number(b.gstRate):a[i].gstRate,moq:b.moq!==undefined?Number(b.moq):a[i].moq,leadTime:b.leadTime??a[i].leadTime,updatedAt:now()};writeJson(files.products,a);activity(req,'Updated','Product',a[i].id,a[i].name);res.json(a[i])});
app.delete('/api/admin/products/:id',auth,role('Owner','Admin','Content Manager'),(req,res)=>{const a=readJson(files.products,[]),n=a.filter(x=>x.id!==req.params.id);if(n.length===a.length)return res.status(404).json({error:'Product not found'});writeJson(files.products,n);activity(req,'Deleted','Product',req.params.id);res.json({ok:true})});
app.post('/api/admin/uploads',auth,upload.array('images',20),(req,res)=>res.json({images:(req.files||[]).map(f=>`/uploads/products/${f.filename}`)}));
app.post('/api/admin/products/:id/images',auth,upload.array('images',20),(req,res)=>{const a=readJson(files.products,[]).map(baseProduct),p=a.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Product not found'});const urls=(req.files||[]).map(f=>`/uploads/products/${f.filename}`);p.images.push(...urls);writeJson(files.products,a);res.json({images:urls,product:p})});
app.delete('/api/admin/products/:id/images',auth,(req,res)=>{const a=readJson(files.products,[]).map(baseProduct),p=a.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Product not found'});const image=req.body.image;p.images=p.images.filter(x=>x!==image);if(image?.startsWith('/uploads/')){const f=path.join(PUBLIC,image.replace(/^\//,''));if(fs.existsSync(f))fs.unlinkSync(f)}writeJson(files.products,a);res.json(p)});

app.post('/api/enquiries',(req,res)=>{const body=req.body||{},customer=customerFor(body),e={id:crypto.randomUUID(),...body,customerId:customer.id,status:'New',source:body.source||'Website',estimatedValue:Number(body.estimatedValue||0),createdAt:now(),updatedAt:now()};const all=readJson(files.enquiries,[]);all.unshift(e);writeJson(files.enquiries,all);res.json({ok:true,id:e.id,customerId:customer.id})});
app.get('/api/admin/enquiries',auth,(req,res)=>res.json(readJson(files.enquiries,[])));
app.put('/api/admin/enquiries/:id',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const a=readJson(files.enquiries,[]),i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Enquiry not found'});a[i]={...a[i],...req.body,updatedAt:now()};writeJson(files.enquiries,a);activity(req,'Updated','Enquiry',a[i].id,a[i].status);res.json(a[i])});
app.delete('/api/admin/enquiries/:id',auth,role('Owner','Admin','Sales Manager'),(req,res)=>{const a=readJson(files.enquiries,[]).filter(x=>x.id!==req.params.id);writeJson(files.enquiries,a);activity(req,'Deleted','Enquiry',req.params.id);res.json({ok:true})});

app.get('/api/admin/customers',auth,(req,res)=>res.json(readJson(files.customers,[])));
app.post('/api/admin/customers',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const c={id:crypto.randomUUID(),...req.body,createdAt:now(),tags:Array.isArray(req.body.tags)?req.body.tags:[]};const a=readJson(files.customers,[]);a.unshift(c);writeJson(files.customers,a);activity(req,'Created','Customer',c.id,c.name);res.json(c)});
app.put('/api/admin/customers/:id',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const a=readJson(files.customers,[]),i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Customer not found'});a[i]={...a[i],...req.body,updatedAt:now()};writeJson(files.customers,a);res.json(a[i])});
app.delete('/api/admin/customers/:id',auth,role('Owner','Admin'),(req,res)=>{const a=readJson(files.customers,[]).filter(x=>x.id!==req.params.id);writeJson(files.customers,a);res.json({ok:true})});

app.get('/api/admin/quotes',auth,(req,res)=>res.json(readJson(files.quotes,[])));
app.post('/api/admin/quotes',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const b=req.body||{},q={id:crypto.randomUUID(),quoteNo:'Q-'+String(Date.now()).slice(-7),customerId:b.customerId||'',items:Array.isArray(b.items)?b.items:[],subtotal:Number(b.subtotal||0),discount:Number(b.discount||0),tax:Number(b.tax||0),total:Number(b.total||0),status:b.status||'Draft',validUntil:b.validUntil||'',assignedTo:b.assignedTo||req.admin.name,notes:b.notes||'',createdAt:now(),updatedAt:now()};const a=readJson(files.quotes,[]);a.unshift(q);writeJson(files.quotes,a);activity(req,'Created','Quote',q.id,q.quoteNo);res.json(q)});
app.put('/api/admin/quotes/:id',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const a=readJson(files.quotes,[]),i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Quote not found'});a[i]={...a[i],...req.body,updatedAt:now()};writeJson(files.quotes,a);activity(req,'Updated','Quote',a[i].id,a[i].status);res.json(a[i])});
app.post('/api/admin/quotes/:id/convert',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const q=readJson(files.quotes,[]).find(x=>x.id===req.params.id);if(!q)return res.status(404).json({error:'Quote not found'});const orders=readJson(files.orders,[]),o={id:crypto.randomUUID(),orderNo:'ORD-'+String(Date.now()).slice(-7),customerId:q.customerId,quoteId:q.id,items:q.items,subtotal:q.subtotal,discount:q.discount,tax:q.tax,total:q.total,paymentStatus:'Pending',status:'New',salesperson:q.assignedTo||req.admin.name,source:'Quote',createdAt:now(),updatedAt:now()};orders.unshift(o);writeJson(files.orders,orders);const qs=readJson(files.quotes,[]),qi=qs.findIndex(x=>x.id===q.id);if(qi>=0){qs[qi].status='Accepted';qs[qi].updatedAt=now();writeJson(files.quotes,qs)}activity(req,'Converted','Quote',q.id,o.orderNo);res.json(o)});

app.get('/api/admin/orders',auth,(req,res)=>res.json(readJson(files.orders,[])));
app.post('/api/admin/orders',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const b=req.body||{},o={id:crypto.randomUUID(),orderNo:'ORD-'+String(Date.now()).slice(-7),customerId:b.customerId||'',quoteId:b.quoteId||'',items:Array.isArray(b.items)?b.items:[],subtotal:Number(b.subtotal||0),discount:Number(b.discount||0),tax:Number(b.tax||0),total:Number(b.total||0),paymentStatus:b.paymentStatus||'Pending',status:b.status||'New',salesperson:b.salesperson||req.admin.name,source:b.source||'Manual',deliveryStatus:b.deliveryStatus||'Pending',notes:b.notes||'',createdAt:now(),updatedAt:now()};const a=readJson(files.orders,[]);a.unshift(o);writeJson(files.orders,a);activity(req,'Created','Order',o.id,o.orderNo);res.json(o)});
app.put('/api/admin/orders/:id',auth,role('Owner','Admin','Sales Manager','Salesperson'),(req,res)=>{const a=readJson(files.orders,[]),i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Order not found'});a[i]={...a[i],...req.body,updatedAt:now()};writeJson(files.orders,a);res.json(a[i])});

app.get('/api/admin/inventory',auth,(req,res)=>{const inv=readJson(files.inventory,[]),ps=readJson(files.products,[]);res.json(inv.map(x=>({...x,product:ps.find(p=>p.id===x.productId)?.name||x.productId}))) });
app.put('/api/admin/inventory/:productId',auth,role('Owner','Admin','Sales Manager'),(req,res)=>{const a=readJson(files.inventory,[]),i=a.findIndex(x=>x.productId===req.params.productId),b=req.body||{},v={id:i>=0?a[i].id:crypto.randomUUID(),productId:req.params.productId,sku:b.sku||a[i]?.sku||'',stock:Number(b.stock??a[i]?.stock??0),reserved:Number(b.reserved??a[i]?.reserved??0),lowStock:Number(b.lowStock??a[i]?.lowStock??5),warehouse:b.warehouse||a[i]?.warehouse||'Main',incoming:Number(b.incoming??a[i]?.incoming??0),updatedAt:now()};if(i>=0)a[i]=v;else a.push(v);writeJson(files.inventory,a);activity(req,'Updated','Inventory',v.productId);res.json(v)});

app.get('/api/admin/users',auth,role('Owner','Admin'),(req,res)=>res.json(readJson(files.users,[]).map(({passwordHash,...u})=>u)));
app.post('/api/admin/users',auth,role('Owner'),(req,res)=>{const b=req.body||{};if(!b.name||!b.email||!b.password)return res.status(400).json({error:'Name, email and password are required'});const a=readJson(files.users,[]);if(a.some(u=>u.email.toLowerCase()===b.email.toLowerCase()))return res.status(409).json({error:'User already exists'});const u={id:crypto.randomUUID(),name:b.name,email:b.email,role:b.role||'Salesperson',active:b.active!==false,passwordHash:hashPassword(b.password),createdAt:now()};a.push(u);writeJson(files.users,a);activity(req,'Created','User',u.id,u.email);const {passwordHash,...safe}=u;res.json(safe)});
app.put('/api/admin/users/:id',auth,role('Owner'),(req,res)=>{const a=readJson(files.users,[]),i=a.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'User not found'});const b=req.body||{};a[i]={...a[i],name:b.name??a[i].name,email:b.email??a[i].email,role:b.role??a[i].role,active:b.active!==undefined?!!b.active:a[i].active};if(b.password)a[i].passwordHash=hashPassword(b.password);writeJson(files.users,a);const {passwordHash,...safe}=a[i];res.json(safe)});

app.get('/api/admin/activity',auth,(req,res)=>res.json(readJson(files.activity,[]).slice(0,250)));
app.get('/api/admin/analytics',auth,(req,res)=>{const orders=readJson(files.orders,[]),enq=readJson(files.enquiries,[]),quotes=readJson(files.quotes,[]),products=readJson(files.products,[]),customers=readJson(files.customers,[]),events=readJson(files.analytics,[]);const paid=orders.filter(o=>o.status!=='Cancelled');const revenue=paid.reduce((n,o)=>n+Number(o.total||0),0),units=paid.reduce((n,o)=>n+(o.items||[]).reduce((s,i)=>s+Number(i.quantity||i.qty||0),0),0);const months=[];const d=new Date();for(let i=11;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1),key=x.toISOString().slice(0,7);const m=paid.filter(o=>String(o.createdAt||'').slice(0,7)===key);months.push({month:x.toLocaleString('en-IN',{month:'short',year:'numeric'}),revenue:m.reduce((n,o)=>n+Number(o.total||0),0),orders:m.length})}const prodMap={};for(const o of paid)for(const it of o.items||[]){const id=it.productId||it.id||it.product;prodMap[id]??={productId:id,name:it.productName||it.name||id,units:0,revenue:0};prodMap[id].units+=Number(it.quantity||it.qty||0);prodMap[id].revenue+=Number(it.total||Number(it.quantity||it.qty||0)*Number(it.unitPrice||it.price||0))}const topProducts=Object.values(prodMap).sort((a,b)=>b.revenue-a.revenue);const pipelineStatuses=['New','Contacted','Qualified','Quoted','Negotiation'];const funnel={enquiries:enq.length,qualified:enq.filter(e=>['Qualified','Quoted','Negotiation','Won'].includes(e.status)).length,quoted:quotes.filter(q=>['Sent','Viewed','Accepted'].includes(q.status)).length,won:orders.filter(o=>o.status!=='Cancelled').length};const visits=events.filter(e=>e.type==='page_view').length,productViews=events.filter(e=>e.type==='product_view').length,wa=events.filter(e=>e.type==='whatsapp_click').length;const conversion=enq.length?orders.filter(o=>o.status!=='Cancelled').length/enq.length*100:0;res.json({kpis:{revenue,orders:paid.length,averageOrderValue:paid.length?revenue/paid.length:0,units,enquiries:enq.length,customers:customers.length,pipelineValue:enq.filter(e=>!['Won','Lost'].includes(e.status)).reduce((n,e)=>n+Number(e.estimatedValue||0),0),conversionRate:conversion},months,topProducts,funnel,web:{visits,productViews,whatsappClicks:wa,eventCount:events.length},categories:products.map(p=>({category:p.category,revenue:topProducts.filter(x=>products.find(pp=>pp.id===x.productId)?.category===p.category).reduce((n,x)=>n+x.revenue,0)})).filter((x,i,a)=>a.findIndex(y=>y.category===x.category)===i)});});
app.post('/api/analytics/event',(req,res)=>{const b=req.body||{};if(!['page_view','product_view','whatsapp_click','catalogue_download','search','contact_click'].includes(b.type))return res.status(400).json({error:'Unsupported event'});const a=readJson(files.analytics,[]);a.push({id:crypto.randomUUID(),type:b.type,productId:b.productId||'',path:b.path||'',source:b.source||'',createdAt:now()});writeJson(files.analytics,a.slice(-20000));res.json({ok:true})});

app.post('/api/admin/catalogue',auth,(req,res,next)=>{const cs=multer.diskStorage({destination:(r,f,cb)=>cb(null,ASSETS),filename:(r,f,cb)=>cb(null,'EMPERIA-LED-Catalogue-2026.pdf')});multer({storage:cs,limits:{fileSize:30*1024*1024},fileFilter:(r,f,cb)=>cb(path.extname(f.originalname).toLowerCase()==='.pdf'?null:new Error('Catalogue must be a PDF.'))})(req,res,e=>e?next(e):res.json({ok:true,url:'/assets/EMPERIA-LED-Catalogue-2026.pdf'}))});
app.put('/api/admin/settings',auth,(req,res)=>{const c=readJson(files.settings,{}),n={...c,...req.body};writeJson(files.settings,n);activity(req,'Updated','Settings','site');res.json(n)});
app.post('/api/admin/projects',auth,(req,res)=>{const a=readJson(files.projects,[]),item={id:crypto.randomUUID(),...req.body,images:Array.isArray(req.body.images)?req.body.images:[],createdAt:now()};a.unshift(item);writeJson(files.projects,a);activity(req,'Created','Project',item.id,item.name);res.json(item)});
app.delete('/api/admin/projects/:id',auth,(req,res)=>{const a=readJson(files.projects,[]).filter(x=>x.id!==req.params.id);writeJson(files.projects,a);res.json({ok:true})});

app.use((err,req,res,next)=>res.status(400).json({error:err.message||'Request failed'}));
app.get(/.*/,(req,res)=>res.sendFile(path.join(PUBLIC,'home.html')));
app.listen(PORT,()=>console.log(`EMPERIA LED running at http://localhost:${PORT}`));
