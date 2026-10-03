"use strict";
const corpus = require("../data/assistant-sources.json");
function safeUrl(value) { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } }
function eligible(s) {
 if (!s.verifiedBy || !s.verifiedOn || !s.edition || !safeUrl(s.url)) return false;
 if (s.kind === "registered") return s.status === "applicable";
 const host = new URL(s.url).hostname;
 return (host === "maharashtra.gov.in" || host.endsWith(".maharashtra.gov.in")) && ((s.kind === "model" && s.status === "model-reference") || (["legislation","rules"].includes(s.kind) && s.status === "applicable"));
}
const stop = new Set("what how when where can should my the a an of to for is are do does about society please मला माझ्या काय कसे आहे".split(" "));
function tokens(q) { return [...new Set(q.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [])].filter(t => t.length > 1 && !stop.has(t)); }
function retrieve(q, data = corpus) {
 const words = tokens(q);
 const sources = new Map(data.sources.filter(eligible).map(s => [s.id,s]));
 return data.passages.filter(p => sources.has(p.sourceId) && typeof p.text === "string" && p.text.length <= 6000).map(p => {
 const hay = (p.text+" "+p.provision+" "+(p.keywords||"")).toLowerCase();
 return {...p,source:sources.get(p.sourceId),score:words.reduce((n,t)=>n+(hay.includes(t)?1:0),0)};
 }).filter(p=>p.score>0).sort((a,b)=>(a.source.kind==='registered'?0:1)-(b.source.kind==='registered'?0:1)||b.score-a.score).slice(0,8);
}
module.exports = { retrieve, eligible, safeUrl };
