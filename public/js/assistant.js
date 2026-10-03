(function () {
  "use strict";
  const {$,h,apiPost,checkHealth,showErrors,clearErrors,setLoading}=window.App;
  checkHealth($("#health-banner"));
  const form=$("#ask-form"),btn=$("#ask-btn"),st=$("#ask-status"),box=$("#answer");
  let previousQuestion="";
  form.addEventListener("submit",async ev=>{
    ev.preventDefault(); const question=form.elements.question.value.trim(); clearErrors(form); box.hidden=true;
    if(question.length<5 || question.length>1000){showErrors(form,{question:"Enter 5–1000 characters."});return;}
    st.className="status loading";st.textContent="Retrieving sources and generating an answer…";setLoading(btn,true,"Loading…");box.setAttribute("aria-busy","true");
    try{
      const out=await apiPost("/api/rules-qa",{question,previousQuestion,language:form.elements.language.value});
      box.replaceChildren(...[h("p",{class:"notice",text:out.answer}),out.disclaimer?h("p",{class:"notice notice-warn",text:out.disclaimer}):null,h("p",{text:(form.elements.language.value==="mr"?"पुढील पाऊल: ":"Practical next step: ")+out.nextStep}),h("p",{text:out.clarification}),...(out.citations||[]).map(c=>h("div",{class:"card"},h("strong",{text:c.sourceTitle}),h("p",{text:c.locator+" · Edition: "+c.edition+" · "+c.kind}),h("blockquote",{text:c.quote}),h("a",{href:c.sourceUrl,target:"_blank",rel:"noopener noreferrer",text:"Open source"}))),h("button",{type:"button",class:"btn",id:"followup",text:"Ask a follow-up"}),h("button",{type:"button",class:"btn",id:"draft-concern",text:"Draft a letter about this"})].filter(Boolean));
      $("#followup").addEventListener("click",()=>{previousQuestion=(previousQuestion?previousQuestion+"\n":"")+question;previousQuestion=previousQuestion.slice(-1000);form.elements.question.value="";form.elements.question.focus();st.textContent="Follow-up to: "+question;});
      $("#draft-concern").addEventListener("click",()=>{try{sessionStorage.setItem("society-assistant-concern",JSON.stringify({question:previousQuestion?previousQuestion+"\n"+question:question}));location.href="/letter.html";}catch{st.textContent="Browser storage unavailable. Copy your concern into the member letter form.";}});
      box.hidden=false;st.textContent="";
    }catch(err){st.className="status err";st.textContent=err.message;}finally{setLoading(btn,false);box.setAttribute("aria-busy","false");}
  });
})();
