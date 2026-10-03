"use strict";
const data = require("../netlify/data/assistant-sources.json");
const {eligible,safeUrl}=require("../netlify/lib/retrieval");
const ids=new Set(),passages=new Set();
for(const s of data.sources){if(ids.has(s.id)||!s.id||!s.title||!safeUrl(s.url))throw Error("Invalid/duplicate source: "+s.id);ids.add(s.id);console.log(s.id+": "+(eligible(s)?"retrievable":"excluded; check status/verification"));}
for(const p of data.passages){if(passages.has(p.id)||!p.id||!ids.has(p.sourceId)||!p.provision||typeof p.text!=="string"||p.text.length<15||p.text.length>6000||!Number.isInteger(p.page)||p.page<1)throw Error("Invalid passage: "+p.id);passages.add(p.id);}
console.log(data.sources.length+" sources; "+data.passages.length+" validated passages. Verify actual registration and wording manually.");
