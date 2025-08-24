require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const TAX_RATE = parseFloat(process.env.TAX_RATE || "0.115");
const PRICE_DIR = process.env.PRICE_DIR || path.join(process.cwd(), "categorias_precios");

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, 'public')));

function readFlexible(filePath){
  try{
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if(Array.isArray(data)) return {type:'array', items: data};
    if(data && typeof data === 'object'){
      const buckets = {};
      for(const [k,v] of Object.entries(data)){
        if(Array.isArray(v)) buckets[k]=v;
      }
      if(Object.keys(buckets).length) return {type:'buckets', buckets};
      return {type:'array', items: Object.values(data)};
    }
  }catch(e){ console.error("[ERROR] reading JSON:", filePath, e.message); }
  return {type:'array', items:[]};
}

function withTax(price){
  const p = Number(price);
  if(Number.isFinite(p)){
    const total = p * (1 + TAX_RATE);
    return Math.round(total*100)/100;
  }
  return null;
}

function fuseText(obj){ try{ return JSON.stringify(obj).toLowerCase(); } catch { return ""; } }

function loadFromDir(dirPath){
  const map = {};
  if(!fs.existsSync(dirPath)) return map;
  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith(".json")).sort();
  for(const fname of files){
    const full = path.join(dirPath, fname);
    const base = fname.replace(/\.json$/i, "");
    const doc = readFlexible(full);
    if(doc.type === 'array'){
      map[base] = (doc.items||[]).map((item,idx)=>({...item, _id:`${base}:${idx}`, _category:base, price_with_tax:withTax(item.price)}));
    }else if(doc.type==='buckets'){
      for(const [bucket, rows] of Object.entries(doc.buckets)){
        const cat = `${base}_${bucket}`.toLowerCase().replace(/\s+/g,"_");
        map[cat] = (rows||[]).map((it,idx)=>({...it, _id:`${cat}:${idx}`, _category:cat, price_with_tax:withTax(it.price)}));
      }
    }
  }
  return map;
}

function loadDB(){ return loadFromDir(PRICE_DIR); }

app.get("/api/categories",(req,res)=>{
  const db = loadDB();
  res.json({ok:true, categories:Object.keys(db)});
});

app.get("/api/items",(req,res)=>{
  const cat = String(req.query.category||"").trim();
  const db = loadDB();
  if(!cat||!db[cat]) return res.status(400).json({ok:false,error:"Unknown category"});
  res.json({ok:true, items:db[cat]});
});

app.get("/api/search",(req,res)=>{
  const q = String(req.query.q||"").toLowerCase().trim();
  if(!q) return res.json({ok:true,items:[]});
  const db = loadDB();
  const results = [];
  for(const cat of Object.keys(db)){
    for(const item of db[cat]){
      if(fuseText(item).includes(q)){
        results.push(item);
        if(results.length>=1000) break;
      }
    }
    if(results.length>=1000) break;
  }
  res.json({ok:true, items:results});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, ()=>{
  console.log(`[OK] Precios online en http://localhost:${PORT}`);
});
