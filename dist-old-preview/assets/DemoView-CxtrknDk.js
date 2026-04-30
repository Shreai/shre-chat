import{r as u,j as e}from"./react-vendor-BCvXvu6e.js";const m=Date.now(),f=6e4,w=[{id:"demo-sales-summary",title:"Today's Sales Summary",agentId:"storepulse",agentName:"StorePulse",agentEmoji:"🛍️",messages:[{role:"user",content:"Show me today's sales summary",timestamp:m-10*f},{role:"assistant",content:`Here's your sales summary for today:

| Metric | Value |
|--------|-------|
| Total Revenue | **$12,847.32** |
| Transactions | **187** |
| Avg Ticket | **$68.70** |
| Items Sold | **432** |
| Returns | **3 ($142.50)** |

**Top Categories:**
1. Tobacco & Nicotine — $4,210 (32.8%)
2. Beverages — $2,890 (22.5%)
3. Snacks & Candy — $1,920 (14.9%)
4. Grocery — $1,650 (12.8%)
5. Lottery — $1,180 (9.2%)

**Hourly Peak:** 11 AM - 1 PM (62 transactions, $4,320)

Revenue is **+8.3%** vs same day last week. Beverage sales jumped 15% — likely the new energy drink promo is driving traffic.`,timestamp:m-9*f}]},{id:"demo-inventory-alerts",title:"Low Inventory Alerts",agentId:"storepulse",agentName:"StorePulse",agentEmoji:"🛍️",messages:[{role:"user",content:"Which items are low on inventory?",timestamp:m-8*f},{role:"assistant",content:`Found **7 items** below reorder threshold:

| Item | On Hand | Reorder Point | Status |
|------|---------|---------------|--------|
| Marlboro Gold Kings | 12 packs | 50 | ⚠️ Critical |
| Red Bull 8.4oz | 18 units | 48 | ⚠️ Critical |
| Coca-Cola 20oz | 24 units | 36 | ⚠️ Low |
| Doritos Nacho Cheese | 8 bags | 24 | ⚠️ Low |
| Bic Classic Lighter | 15 units | 30 | ⚠️ Low |
| Powerade Mountain Berry | 6 units | 18 | ⚠️ Low |
| Jack Link's Beef Jerky | 4 bags | 12 | ⚠️ Low |

**Recommended Actions:**
- Place emergency order for Marlboro Gold and Red Bull (2-3 day lead time)
- Standard reorder for remaining items via your McLane distribution schedule
- Consider increasing Doritos reorder point — it's sold out 3 times this month

Want me to draft the purchase orders?`,timestamp:m-7*f}]},{id:"demo-weekly-comparison",title:"This Week vs Last Week",agentId:"storepulse",agentName:"StorePulse",agentEmoji:"🛍️",messages:[{role:"user",content:"Compare this week vs last week",timestamp:m-6*f},{role:"assistant",content:`**Weekly Performance Comparison** (Mon-Thu so far)

| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| Revenue | $48,230 | $44,890 | ⬆️ **+7.4%** |
| Transactions | 712 | 685 | ⬆️ +3.9% |
| Avg Ticket | $67.74 | $65.53 | ⬆️ +3.4% |
| Gross Margin | 34.2% | 33.8% | ⬆️ +0.4pp |
| Customer Count | 683 | 661 | ⬆️ +3.3% |
| Items/Transaction | 2.4 | 2.3 | ⬆️ +4.3% |

**Category Movers:**
- ⬆️ Beverages: +15.2% ($8,420 vs $7,310) — new energy drink promo
- ⬆️ Tobacco: +4.1% ($15,890 vs $15,260)
- ⬇️ Lottery: -8.3% ($3,450 vs $3,760) — no jackpot excitement this week
- ⬆️ Snacks: +12.7% ($7,280 vs $6,460) — BOGO display is working

**Key Insight:** The front-of-store energy drink cooler and BOGO snack display are driving a +$3,340 weekly uplift. Recommend extending both through next week.`,timestamp:m-5*f}]},{id:"demo-promotions",title:"Expiring Promotions",agentId:"storepulse",agentName:"StorePulse",agentEmoji:"🛍️",messages:[{role:"user",content:"What promotions are expiring?",timestamp:m-4*f},{role:"assistant",content:`Found **5 active promotions** — 3 expiring within 7 days:

**⚠️ Expiring This Week:**

| Promotion | Type | Expires | Revenue Impact |
|-----------|------|---------|----------------|
| Monster Energy 2/$5 | Multi-buy | **Mar 28** (tomorrow) | $1,240/week |
| Doritos/Cheetos BOGO | BOGO | **Mar 30** (3 days) | $890/week |
| Marlboro $1 Off Pack | Manufacturer | **Mar 31** (4 days) | $2,100/week |

**Still Running:**

| Promotion | Type | Expires | Revenue Impact |
|-----------|------|---------|----------------|
| Lottery Scratch-Off Bundle | Bundle | Apr 15 | $680/week |
| Coffee Any Size $1.49 | Price Override | Apr 30 | $450/week |

**Recommendations:**
1. **Extend Monster Energy promo** — it's driving foot traffic and basket size. Contact distributor for renewal terms.
2. **Let Doritos BOGO expire** — margins are thin. Switch to a 20% off single-bag deal.
3. **Marlboro $1 Off** expires automatically (manufacturer-funded). New Camel promo starts Apr 1.

Want me to draft the extension request to your Monster rep?`,timestamp:m-3*f}]}],R=["Show me today's sales summary","Which items are low on inventory?","Compare this week vs last week","What promotions are expiring?","Who are my top 10 customers?","Show me hourly traffic patterns","What's my best margin category?","Any employee schedule conflicts?"],k=5;function T(r){const i=r.split(`
`),n=[];let s=[],d=!1;function h(){if(s.length<2)return;const a=s[0],o=s.slice(1).filter(l=>!l.every(g=>/^[-|: ]+$/.test(g)));n.push(e.jsx("div",{className:"overflow-x-auto my-2",children:e.jsxs("table",{style:{borderCollapse:"collapse",width:"100%",fontSize:"12px"},children:[e.jsx("thead",{children:e.jsx("tr",{children:a.map((l,g)=>e.jsx("th",{style:{padding:"6px 10px",textAlign:"left",fontWeight:600,borderBottom:"1px solid var(--c-border-2)",color:"var(--c-text-2)",whiteSpace:"nowrap"},children:y(l.trim())},g))})}),e.jsx("tbody",{children:o.map((l,g)=>e.jsx("tr",{children:l.map((x,v)=>e.jsx("td",{style:{padding:"5px 10px",borderBottom:"1px solid var(--c-border-2)",color:"var(--c-text-3)",whiteSpace:"nowrap"},children:y(x.trim())},v))},g))})]})},`table-${n.length}`)),s=[]}for(let a=0;a<i.length;a++){const o=i[a];if(o.includes("|")&&o.trim().startsWith("|")){const l=o.split("|").slice(1,-1);if(l.length>0){d=!0,s.push(l);continue}}d&&(h(),d=!1),o.trim()===""?n.push(e.jsx("div",{style:{height:8}},`br-${a}`)):o.startsWith("**")&&o.endsWith("**")?n.push(e.jsx("p",{style:{fontWeight:700,color:"var(--c-text-1)",margin:"6px 0 2px",fontSize:"12px"},children:y(o)},a)):/^\d+\.\s/.test(o)?n.push(e.jsx("p",{style:{paddingLeft:12,color:"var(--c-text-3)",fontSize:"12px",margin:"2px 0"},children:y(o)},a)):o.startsWith("- ")?n.push(e.jsx("p",{style:{paddingLeft:12,color:"var(--c-text-3)",fontSize:"12px",margin:"2px 0"},children:y(o)},a)):n.push(e.jsx("p",{style:{color:"var(--c-text-3)",fontSize:"12px",margin:"2px 0",lineHeight:1.6},children:y(o)},a))}return d&&h(),n}function y(r){return r.split(/(\*\*[^*]+\*\*)/g).map((n,s)=>n.startsWith("**")&&n.endsWith("**")?e.jsx("strong",{style:{color:"var(--c-text-1)",fontWeight:600},children:n.slice(2,-2)},s):e.jsx("span",{children:n},s))}function W({msg:r,agentName:i,agentEmoji:n}){const s=r.role==="user";return e.jsxs("div",{style:{display:"flex",gap:8,marginBottom:12,justifyContent:s?"flex-end":"flex-start"},children:[!s&&e.jsx("div",{style:{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--c-bg-3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14},children:n}),e.jsxs("div",{style:{maxWidth:"85%",padding:"8px 12px",borderRadius:12,background:s?"var(--c-accent, #6366f1)":"var(--c-bg-2)",color:s?"#fff":"var(--c-text-2)",fontSize:12,lineHeight:1.5},children:[!s&&e.jsx("div",{style:{fontSize:10,fontWeight:600,color:"var(--c-text-4)",marginBottom:4},children:i}),s?r.content:T(r.content)]})]})}function B(){const[r,i]=u.useState(w[0]),[n,s]=u.useState(0),[d,h]=u.useState(""),[a,o]=u.useState([]),[l,g]=u.useState(!1),x=u.useRef(null),v=u.useRef(null),b=n>=k;u.useEffect(()=>{x.current&&(x.current.scrollTop=x.current.scrollHeight)},[r,a]);function j(t){i(t),o([])}function $(){if(!d.trim()||n>=k||l)return;const t={role:"user",content:d.trim(),timestamp:Date.now()},c=n+1;o(p=>[...p,t]),h(""),s(c),g(!0),setTimeout(()=>{const p={role:"assistant",content:z(t.content),timestamp:Date.now()};o(S=>[...S,p]),g(!1)},800+Math.random()*1200)}function C(t){if(b||l)return;h(t);const c=w.find(p=>{var S;return((S=p.messages[0])==null?void 0:S.content.toLowerCase())===t.toLowerCase()});c&&c.id!==r.id?(j(c),s(p=>p+1)):(h(t),setTimeout(()=>{var p;return(p=v.current)==null?void 0:p.focus()},50))}const M=[...r.messages,...a];return e.jsxs("div",{style:{height:"100vh",display:"flex",flexDirection:"column",background:"var(--c-bg-1, #0a0a0f)",color:"var(--c-text-1, #e8e8f0)",fontFamily:"-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"},children:[e.jsxs("div",{style:{padding:"10px 16px",textAlign:"center",flexShrink:0,background:"linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.1))",borderBottom:"1px solid rgba(99,102,241,0.2)",display:"flex",alignItems:"center",justifyContent:"center",gap:12},children:[e.jsxs("span",{style:{fontSize:13,color:"var(--c-text-2, #a0a0b8)"},children:["Demo Mode — ",k-n," messages remaining"]}),e.jsx("a",{href:"/",style:{padding:"5px 14px",borderRadius:16,fontSize:12,fontWeight:600,background:"var(--c-accent, #6366f1)",color:"#fff",textDecoration:"none"},children:"Sign up for full access"})]}),e.jsxs("div",{style:{flex:1,display:"flex",minHeight:0},children:[e.jsxs("div",{style:{width:240,flexShrink:0,borderRight:"1px solid var(--c-border-1, #222233)",background:"var(--c-bg-2, #111118)",display:"flex",flexDirection:"column",overflow:"hidden"},children:[e.jsx("div",{style:{padding:"14px 12px 8px",fontSize:11,fontWeight:600,color:"var(--c-text-4, #6a6a82)",textTransform:"uppercase",letterSpacing:"0.05em"},children:"Sample Conversations"}),w.map(t=>e.jsxs("button",{onClick:()=>j(t),style:{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"none",cursor:"pointer",background:r.id===t.id?"var(--c-bg-3, #1c1c28)":"transparent",color:r.id===t.id?"var(--c-text-1)":"var(--c-text-3, #a0a0b8)",fontSize:12,textAlign:"left",width:"100%",borderLeft:r.id===t.id?"2px solid var(--c-accent, #6366f1)":"2px solid transparent",transition:"all 0.15s"},children:[e.jsx("span",{style:{fontSize:16},children:t.agentEmoji}),e.jsxs("div",{style:{minWidth:0},children:[e.jsx("div",{style:{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:t.title}),e.jsx("div",{style:{fontSize:10,color:"var(--c-text-5, #555570)"},children:t.agentName})]})]},t.id))]}),e.jsxs("div",{style:{flex:1,display:"flex",flexDirection:"column",minWidth:0},children:[e.jsxs("div",{style:{padding:"10px 16px",display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid var(--c-border-1, #222233)",flexShrink:0},children:[e.jsx("span",{style:{fontSize:18},children:r.agentEmoji}),e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:13,fontWeight:600,color:"var(--c-text-1)"},children:r.agentName}),e.jsx("div",{style:{fontSize:10,color:"var(--c-text-4)"},children:"AI Retail Assistant"})]}),e.jsxs("div",{style:{marginLeft:"auto",display:"flex",alignItems:"center",gap:6},children:[e.jsx("span",{style:{width:6,height:6,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}),e.jsx("span",{style:{fontSize:10,color:"var(--c-text-4)"},children:"Online"})]})]}),e.jsxs("div",{ref:x,style:{flex:1,overflowY:"auto",padding:16,minHeight:0},children:[M.map((t,c)=>e.jsx(W,{msg:t,agentName:r.agentName,agentEmoji:r.agentEmoji},`${r.id}-${c}`)),l&&e.jsxs("div",{style:{display:"flex",gap:8,marginBottom:12},children:[e.jsx("div",{style:{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--c-bg-3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14},children:r.agentEmoji}),e.jsx("div",{style:{padding:"8px 12px",borderRadius:12,background:"var(--c-bg-2)",fontSize:12,color:"var(--c-text-4)"},children:e.jsx("span",{className:"animate-pulse",children:"Thinking..."})})]})]}),!b&&a.length===0&&e.jsxs("div",{style:{padding:"8px 16px",display:"flex",gap:6,flexWrap:"wrap",borderTop:"1px solid var(--c-border-2, #1a1a2a)"},children:[e.jsx("span",{style:{fontSize:10,color:"var(--c-text-5)",alignSelf:"center",marginRight:4},children:"Try asking:"}),R.slice(0,4).map(t=>e.jsx("button",{onClick:()=>C(t),style:{padding:"4px 10px",borderRadius:12,border:"1px solid var(--c-border-2, #2a2a3a)",background:"var(--c-bg-2)",color:"var(--c-text-3)",fontSize:11,cursor:"pointer",transition:"all 0.15s"},onMouseEnter:c=>{c.target.style.borderColor="var(--c-accent, #6366f1)"},onMouseLeave:c=>{c.target.style.borderColor="var(--c-border-2, #2a2a3a)"},children:t},t))]}),b&&e.jsxs("div",{style:{padding:"20px 16px",textAlign:"center",background:"linear-gradient(180deg, transparent, rgba(99,102,241,0.05))",borderTop:"1px solid var(--c-border-1)"},children:[e.jsxs("p",{style:{fontSize:14,fontWeight:600,color:"var(--c-text-1)",marginBottom:6},children:["You've used all ",k," demo messages"]}),e.jsx("p",{style:{fontSize:12,color:"var(--c-text-4)",marginBottom:12},children:"Sign up to get unlimited access to all AI agents, analytics, and tools."}),e.jsx("a",{href:"/",style:{display:"inline-block",padding:"10px 28px",borderRadius:12,background:"var(--c-accent, #6366f1)",color:"#fff",fontSize:14,fontWeight:600,textDecoration:"none"},children:"Get Started — Free"})]}),!b&&e.jsxs("div",{style:{padding:"8px 12px",display:"flex",gap:8,alignItems:"flex-end",borderTop:"1px solid var(--c-border-1, #222233)",background:"var(--c-bg-2, #111118)"},children:[e.jsx("textarea",{ref:v,value:d,onChange:t=>h(t.target.value),onKeyDown:t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),$())},placeholder:"Type a message...",rows:1,style:{flex:1,resize:"none",border:"1px solid var(--c-border-2, #2a2a3a)",borderRadius:12,padding:"8px 12px",fontSize:13,background:"var(--c-bg-1)",color:"var(--c-text-1)",outline:"none",fontFamily:"inherit"}}),e.jsx("button",{onClick:$,disabled:!d.trim()||l,style:{width:36,height:36,borderRadius:"50%",border:"none",background:d.trim()?"var(--c-accent, #6366f1)":"var(--c-bg-3)",color:"#fff",cursor:d.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.15s"},children:e.jsxs("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:[e.jsx("line",{x1:"22",y1:"2",x2:"11",y2:"13"}),e.jsx("polygon",{points:"22 2 15 22 11 13 2 9 22 2"})]})})]})]})]})]})}function z(r){const i=r.toLowerCase();return i.includes("customer")||i.includes("top")?`Here are your **Top 5 customers** this week:

| Customer | Visits | Spend | Avg Ticket |
|----------|--------|-------|------------|
| Regular #1042 | 7 | $312.40 | $44.63 |
| Regular #0887 | 5 | $278.90 | $55.78 |
| Regular #1203 | 6 | $245.20 | $40.87 |
| Regular #0654 | 4 | $198.70 | $49.68 |
| Regular #0921 | 5 | $187.30 | $37.46 |

Loyalty program members spend **42% more** than non-members on average.`:i.includes("traffic")||i.includes("hour")||i.includes("busy")?`**Hourly Traffic Pattern** (today):

| Hour | Transactions | Revenue |
|------|-------------|---------|
| 6-8 AM | 28 | $1,120 |
| 8-10 AM | 42 | $2,380 |
| 10 AM-12 PM | 38 | $2,650 |
| **12-2 PM** | **52** | **$3,890** |
| 2-4 PM | 31 | $1,940 |
| 4-6 PM | 45 | $3,210 |
| 6-8 PM | 35 | $2,450 |

**Peak hours:** 12-2 PM (lunch rush) and 4-6 PM (after-work)
**Recommendation:** Staff 2 registers during peak, 1 register off-peak.`:i.includes("margin")||i.includes("profit")?`**Gross Margin by Category:**

| Category | Revenue | COGS | Margin | Margin % |
|----------|---------|------|--------|----------|
| Tobacco | $15,890 | $13,510 | $2,380 | 15.0% |
| Beverages | $8,420 | $4,630 | $3,790 | **45.0%** |
| Snacks | $7,280 | $4,005 | $3,275 | **45.0%** |
| Grocery | $6,520 | $4,890 | $1,630 | 25.0% |
| Lottery | $3,450 | $3,105 | $345 | 10.0% |

**Best margin:** Beverages and Snacks at 45%
**Highest revenue:** Tobacco at $15,890 (but lowest margin)

Consider expanding your beverage selection — high margin + growing sales.`:`I can help with that! In the full version of Shre AI, I would analyze your real POS data to answer this question.

**What I can do:**
- Real-time sales and inventory analytics
- Predictive demand forecasting
- Employee scheduling optimization
- Vendor performance tracking
- Customer segmentation and loyalty analysis

Sign up to connect your POS system and get AI-powered insights tailored to your business.`}export{B as DemoView};
