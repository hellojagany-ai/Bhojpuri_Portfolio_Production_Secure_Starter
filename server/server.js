import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) throw new Error("SESSION_SECRET is required");

const db = new Database(path.join(__dirname, "portfolio.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 category TEXT NOT NULL,
 description TEXT DEFAULT '',
 filename TEXT NOT NULL,
 published INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
);
`);

const seed = db.prepare("SELECT COUNT(*) c FROM projects").get().c;
if (!seed) {
  const items = [
    ["p1","Real Estate Plot Sale Poster","Real Estate Designs","Concept design for a premium residential plot campaign.","project-01.png"],
    ["p2","Sustainability Campaign Poster","Social Media Posters","Minimal campaign artwork focused on everyday sustainable choices.","project-02.png"],
    ["p3","Seasonal E-commerce Promotion","Promotional Designs","Bright promotional composition for a summer sale campaign.","project-03.png"],
    ["p4","Freelance Graphic Designer Banner","Branding","Professional designer identity and service presentation.","project-04.png"],
    ["p5","Technology Product Poster","Promotional Designs","Dark premium product-promotion concept.","project-05.png"]
  ];
  const ins = db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?)");
  const tx = db.transaction(()=>items.forEach(x=>ins.run(x[0],x[1],x[2],x[3],x[4],1,new Date().toISOString())));
  tx();
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"],
      scriptSrc:["'self'"], imgSrc:["'self'","data:"], connectSrc:["'self'"],
      objectSrc:["'none'"], baseUri:["'self'"], frameAncestors:["'none'"]
    }
  }
}));
app.use(express.json({limit:"200kb"}));
app.use(cookieParser());
app.use(rateLimit({windowMs:15*60*1000,max:300,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(path.join(__dirname,"../public"),{extensions:["html"]}));

function clean(v,max=500){ return String(v ?? "").trim().slice(0,max); }
function auth(req,res,next){
  const token=req.cookies.admin_session;
  if(!token) return res.status(401).json({error:"Unauthorized"});
  try{ req.admin=jwt.verify(token,SECRET); next(); }catch{ return res.status(401).json({error:"Unauthorized"}); }
}
function adminCredentialsOk(username,password){
  if(username !== process.env.ADMIN_USERNAME) return false;
  const hash=process.env.ADMIN_PASSWORD_HASH || "";
  return hash ? bcrypt.compareSync(password,hash) : false;
}

app.get("/api/projects",(req,res)=>{
  const rows=db.prepare("SELECT id,title,category,description,filename,published FROM projects WHERE published=1 ORDER BY created_at DESC").all();
  res.json(rows);
});

app.post("/api/login",(req,res)=>{
  const username=clean(req.body.username,120), password=String(req.body.password||"");
  if(!adminCredentialsOk(username,password)) return res.status(401).json({error:"Invalid credentials"});
  const token=jwt.sign({sub:username,role:"admin"},SECRET,{expiresIn:"2h"});
  res.cookie("admin_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:2*60*60*1000});
  res.json({ok:true});
});

app.post("/api/logout",auth,(req,res)=>{res.clearCookie("admin_session");res.json({ok:true});});
app.get("/api/me",auth,(req,res)=>res.json({ok:true,username:req.admin.sub}));

const upload=multer({
  storage:multer.diskStorage({
    destination:(req,file,cb)=>cb(null,path.join(__dirname,"uploads")),
    filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())
  }),
  limits:{fileSize:8*1024*1024,files:1},
  fileFilter:(req,file,cb)=>cb(null,["image/png","image/jpeg","image/webp"].includes(file.mimetype))
});

app.post("/api/projects",auth,upload.single("image"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"Valid PNG/JPEG/WEBP image required"});
  const title=clean(req.body.title,160)||"Untitled Project";
  const category=clean(req.body.category,100)||"Other Designs";
  const description=clean(req.body.description,1000);
  const id=crypto.randomUUID();
  db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?)").run(id,title,category,description,req.file.filename,1,new Date().toISOString());
  res.json({ok:true,id});
});

app.put("/api/projects/:id",auth,(req,res)=>{
  const title=clean(req.body.title,160), category=clean(req.body.category,100), description=clean(req.body.description,1000);
  db.prepare("UPDATE projects SET title=?,category=?,description=?,published=? WHERE id=?")
    .run(title||"Untitled Project",category||"Other Designs",description,req.body.published===false?0:1,req.params.id);
  res.json({ok:true});
});

app.delete("/api/projects/:id",auth,(req,res)=>{
  const row=db.prepare("SELECT filename FROM projects WHERE id=?").get(req.params.id);
  if(row){ try{fs.unlinkSync(path.join(__dirname,"uploads",row.filename));}catch{} }
  db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

app.get("/api/settings",(req,res)=>{
  const get=k=>db.prepare("SELECT value FROM settings WHERE key=?").get(k)?.value || process.env[k] || "";
  res.json({whatsapp:get("WHATSAPP_NUMBER"),email:get("EMAIL")});
});
app.put("/api/settings",auth,(req,res)=>{
  for(const key of ["WHATSAPP_NUMBER","EMAIL"]){
    const value=clean(req.body[key],200);
    db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key,value);
  }
  res.json({ok:true});
});

app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError) return res.status(400).json({error:"Upload rejected: "+err.message});
  res.status(500).json({error:"Server error"});
});

app.listen(PORT,()=>console.log(`Portfolio running on http://localhost:${PORT}`));
