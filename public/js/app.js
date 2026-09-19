const scrapeBtn = document.getElementById('scrapeBtn');
const categoryToggle = document.getElementById('categoryToggle');
const categoryPanel = document.getElementById('categoryPanel');
const categorySearch = document.getElementById('categorySearch');
const categoryList = document.getElementById('categoryList');
const countryToggle = document.getElementById('countryToggle');
const countryPanel = document.getElementById('countryPanel');
const countrySearch = document.getElementById('countrySearch');
const countryList = document.getElementById('countryList');
const stateToggle = document.getElementById('stateToggle');
const statePanel = document.getElementById('statePanel');
const stateSearch = document.getElementById('stateSearch');
const stateList = document.getElementById('stateList');
const cityToggle = document.getElementById('cityToggle');
const cityPanel = document.getElementById('cityPanel');
const citySearch = document.getElementById('citySearch');
const cityList = document.getElementById('cityList');
const areaToggle = document.getElementById('areaToggle');
const areaPanel = document.getElementById('areaPanel');
const areaSearch = document.getElementById('areaSearch');
const areaList = document.getElementById('areaList');
const resultsContainer = document.getElementById('resultsContainer');
const resultsTableBody = document.querySelector('#resultsTable tbody');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const resultCount = document.getElementById('resultCount');
const getMoreBtn = document.getElementById('getMoreBtn');
const downloadBtn = document.getElementById('downloadBtn');
const trackingPanel = document.getElementById('trackingPanel');
const trackingPhase = document.getElementById('trackingPhase');
const trackingBar = document.getElementById('trackingBar');
const trackingLog = document.getElementById('trackingLog');

const categories = ['Gym','Fitness Center','Hotel','Restaurant','Cafe','Dentist','Real Estate','Realtor','Lawyer','Plumber','Electrician','Salon','Barber','Pharmacy','Hospital','School','Library','SaaS founder','Startup founder','Marketing agency','Software engineer'];

let countries=[], states=[], cities=[], areas=[];
let selectedCategory='', selectedCountry='', selectedCountryCode='', selectedCountryPhoneCode='';
let selectedState='', selectedStateCode='', selectedCity='', selectedArea='';
let activeStream=null, processedIds=new Set(), lastPayload=null, currentLeads=[];

function getSelectedSources(){return Array.from(document.querySelectorAll('input[name="source"]:checked')).map(el=>el.value);}
function setDropdownDisabled(el,d){el.disabled=d;el.classList.toggle('is-disabled',d);}
function setDropdownPlaceholder(el,t){el.textContent=t;el.dataset.value='';}
function openPanel(p,s){p.classList.remove('hidden');s.value='';s.focus();}
function closePanel(p){p.classList.add('hidden');}
function closeAllPanels(){[categoryPanel,countryPanel,statePanel,cityPanel,areaPanel].forEach(closePanel);}
document.addEventListener('click',e=>{if(!e.target.closest('.dropdown'))closeAllPanels();});

function buildList(listEl, options, onSelect, allowCustom, searchValue){
  listEl.innerHTML='';
  const q=searchValue.trim().toLowerCase();
  const filtered=options.filter(o=>o.label.toLowerCase().includes(q));
  if(allowCustom&&q&&!options.some(o=>o.label.toLowerCase()===q)){
    const el=document.createElement('div');el.className='dropdown-item';el.textContent=`Use: ${searchValue}`;
    el.onclick=()=>onSelect({label:searchValue,value:searchValue,custom:true});listEl.appendChild(el);
  }
  if(!filtered.length){const e=document.createElement('div');e.className='dropdown-item is-empty';e.textContent='No results';listEl.appendChild(e);return;}
  filtered.forEach(opt=>{const item=document.createElement('div');item.className='dropdown-item';item.textContent=opt.label;item.onclick=()=>onSelect(opt);listEl.appendChild(item);});
}

function wireDropdown({toggleEl,panelEl,searchEl,listEl,getOptions,onSelect,allowCustom=false}){
  toggleEl.onclick=()=>{if(toggleEl.disabled)return;const open=!panelEl.classList.contains('hidden');if(open)closePanel(panelEl);else{openPanel(panelEl,searchEl);buildList(listEl,getOptions(),onSelect,allowCustom,'');}};
  searchEl.oninput=()=>buildList(listEl,getOptions(),onSelect,allowCustom,searchEl.value);
  searchEl.onkeydown=e=>{if(e.key==='Enter'&&allowCustom&&searchEl.value.trim()){e.preventDefault();onSelect({label:searchEl.value.trim(),value:searchEl.value.trim(),custom:true});}};
}

function appendLog(m){const r=document.createElement('div');r.className='tracking-row';r.textContent=m;trackingLog.appendChild(r);trackingLog.scrollTop=trackingLog.scrollHeight;}
function updateProgress(pct,msg){trackingBar.style.width=`${Math.min(100,pct||0)}%`;if(msg)trackingPhase.textContent=msg;}
function resetTracking(){trackingPanel.classList.remove('hidden');trackingPhase.textContent='Starting';trackingBar.style.width='0%';trackingLog.innerHTML='';}

function buildCategoryDropdown(){
  const options=categories.map(c=>({label:c,value:c}));
  wireDropdown({toggleEl:categoryToggle,panelEl:categoryPanel,searchEl:categorySearch,listEl:categoryList,getOptions:()=>options,onSelect:opt=>{selectedCategory=opt.value;categoryToggle.textContent=opt.label;closePanel(categoryPanel);},allowCustom:true});
}

async function loadCountries(){
  const res=await fetch('/api/countries');const list=await res.json();
  countries=list.map(c=>({label:c.name,value:c.name,code:c.isoCode,phonecode:c.phonecode||''}));
  wireDropdown({toggleEl:countryToggle,panelEl:countryPanel,searchEl:countrySearch,listEl:countryList,getOptions:()=>countries,onSelect:opt=>{
    selectedCountry=opt.value;selectedCountryCode=opt.code||'';selectedCountryPhoneCode=opt.phonecode?String(opt.phonecode):'';
    countryToggle.textContent=opt.label;closePanel(countryPanel);resetAfterCountry();if(selectedCountryCode)loadStates(selectedCountryCode);
  }});
}

async function loadStates(code){
  const res=await fetch(`/api/countries/${code}/states`);const list=await res.json();
  states=list.map(s=>({label:s.name,value:s.name,code:s.isoCode}));
  wireDropdown({toggleEl:stateToggle,panelEl:statePanel,searchEl:stateSearch,listEl:stateList,getOptions:()=>states,onSelect:opt=>{
    selectedState=opt.value;selectedStateCode=opt.code||'';stateToggle.textContent=opt.label;closePanel(statePanel);resetAfterState();
    if(selectedCountryCode&&selectedStateCode)loadCities(selectedCountryCode,selectedStateCode);
  }});
  setDropdownDisabled(stateToggle,false);setDropdownPlaceholder(stateToggle,'Select state...');
}

async function loadCities(cc,sc){
  const res=await fetch(`/api/countries/${cc}/states/${sc}/cities`);const list=await res.json();
  cities=list.map(c=>({label:c.name,value:c.name}));
  wireDropdown({toggleEl:cityToggle,panelEl:cityPanel,searchEl:citySearch,listEl:cityList,getOptions:()=>cities,onSelect:opt=>{
    selectedCity=opt.value;cityToggle.textContent=opt.label;closePanel(cityPanel);resetAfterCity();
    setDropdownDisabled(areaToggle,false);setDropdownPlaceholder(areaToggle,'Optional neighborhood...');
    wireDropdown({toggleEl:areaToggle,panelEl:areaPanel,searchEl:areaSearch,listEl:areaList,getOptions:()=>areas,onSelect:a=>{selectedArea=a.value;areaToggle.textContent=a.label;closePanel(areaPanel);},allowCustom:true});
  },allowCustom:true});
  setDropdownDisabled(cityToggle,false);setDropdownPlaceholder(cityToggle,'Select city...');
}

function resetAfterCountry(){selectedState=selectedStateCode=selectedCity=selectedArea='';setDropdownDisabled(stateToggle,true);setDropdownDisabled(cityToggle,true);setDropdownDisabled(areaToggle,true);setDropdownPlaceholder(stateToggle,'Select state...');setDropdownPlaceholder(cityToggle,'Select city...');setDropdownPlaceholder(areaToggle,'Neighborhood...');}
function resetAfterState(){selectedCity=selectedArea='';setDropdownDisabled(cityToggle,true);setDropdownDisabled(areaToggle,true);setDropdownPlaceholder(cityToggle,'Select city...');setDropdownPlaceholder(areaToggle,'Neighborhood...');}
function resetAfterCity(){selectedArea='';setDropdownDisabled(areaToggle,true);setDropdownPlaceholder(areaToggle,'Neighborhood...');}
function stopStream(){if(activeStream){activeStream.close();activeStream=null;}}

document.addEventListener('DOMContentLoaded',async()=>{
  buildCategoryDropdown();
  await loadCountries();
  const us=countries.find(c=>c.code==='US'||/united states/i.test(c.label));
  if(us){selectedCountry=us.value;selectedCountryCode=us.code||'US';selectedCountryPhoneCode=us.phonecode||'1';countryToggle.textContent=us.label;loadStates(selectedCountryCode);}
});

function displayResults(data,append=false){
  resultsContainer.classList.remove('hidden');
  if(!append){resultsTableBody.innerHTML='';currentLeads=[];}
  data.forEach(lead=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><span class="badge">${lead.source||'maps'}</span></td><td>${lead.name||''}</td><td>${lead.address||'-'}</td><td>${lead.phone||'-'}</td><td>${lead.email||'-'}</td><td>${lead.rating||'-'} ${lead.reviews?'('+lead.reviews+')':''}</td><td>${lead.website?`<a href="${lead.website}" target="_blank" rel="noopener">Link</a>`:'-'}</td>`;
    resultsTableBody.appendChild(tr);currentLeads.push(lead);
  });
  resultCount.innerText=resultsTableBody.children.length;
}

scrapeBtn.addEventListener('click',()=>{
  const category=selectedCategory,country=selectedCountry,state=selectedState,city=selectedCity,area=selectedArea;
  const sources=getSelectedSources();
  if(!category||!country){alert('Category and Country are required!');return;}
  if(!sources.length){alert('Select at least one source.');return;}
  statusBar.classList.remove('hidden');resultsContainer.classList.add('hidden');
  scrapeBtn.disabled=true;scrapeBtn.style.opacity='0.7';statusText.innerText='Scraping US leads...';
  resetTracking();processedIds=new Set();lastPayload={category,country,state,city,area,sources};
  stopStream();
  const params=new URLSearchParams({category,country,state,city,area,sources:sources.join(',')});
  activeStream=new EventSource(`/api/search/stream?${params}`);
  activeStream.addEventListener('progress',e=>{const d=JSON.parse(e.data);if(d.message)appendLog(d.message);updateProgress(d.percent,d.message||d.stage);});
  activeStream.addEventListener('done',e=>{
    const d=JSON.parse(e.data);
    if(d.success){(d.data||[]).forEach(x=>{if(x.id)processedIds.add(x.id);});displayResults(d.data||[],false);statusText.innerText='Scraping complete!';appendLog(`Completed. ${d.count} unique leads.`);updateProgress(100,'Completed');}
    else statusText.innerText='Error: '+(d.error||'Unknown');
    scrapeBtn.disabled=false;scrapeBtn.style.opacity='1';stopStream();
  });
  activeStream.addEventListener('error',()=>{statusText.innerText='Connection error';appendLog('Connection error.');scrapeBtn.disabled=false;scrapeBtn.style.opacity='1';stopStream();});
});

getMoreBtn.addEventListener('click',async()=>{
  if(!lastPayload)return;
  getMoreBtn.disabled=true;
  try{
    const res=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...lastPayload,processedIds:[...processedIds]})});
    const result=await res.json();
    if(result.success){(result.data||[]).forEach(x=>{if(x.id)processedIds.add(x.id);});displayResults(result.data||[],true);appendLog(`Fetched ${result.count} more.`);}
  }finally{getMoreBtn.disabled=false;}
});

downloadBtn.addEventListener('click',()=>{
  if(!currentLeads.length){alert('No data');return;}
  const salesperson=prompt('Salesperson:')||'',salesTeam=prompt('Sales Team:')||'',category=prompt('Category:',selectedCategory||'')||'';
  const dial=(selectedCountryPhoneCode||'1').replace(/\D/g,'');
  const rows=[['Source','Name','Phone','Email','City','Country','Address','Website','Salesperson','Sales Team','Category']];
  currentLeads.forEach(lead=>{
    let digits=(lead.phone||'').replace(/\D/g,''),phone='';
    if(digits)phone=digits.startsWith(dial)?`+${digits}`:`+${dial}${digits}`;
    rows.push([lead.source||'',lead.name||'',phone,lead.email||'',selectedCity||'',selectedCountry||'United States',lead.address||'',lead.website||'',salesperson,salesTeam,category]);
  });
  const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return /[,"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='us_leads_export.csv';a.click();
});
