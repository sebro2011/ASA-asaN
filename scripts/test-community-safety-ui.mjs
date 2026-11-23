import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

test('profile and moderator report surfaces render and resolve without exposing reporter identity', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
  for (const [key,value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { CommunityProfile, CommunityReports } = await import('../src/community/CommunitySafety.tsx');
  const calls = [];
  let reports = [{id:'report-1', reason:'Harmful content', reported_body:'Reported content'}];
  const client = {
    from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data:{display_name:'Stargazer',status:'approved'},error:null})})})}),
    rpc: async (name,args) => { calls.push([name,args]); if(name === 'community_report_queue') return {data:reports,error:null}; reports=[]; return {data:'removed',error:null}; },
  };
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(CommunityProfile,{client,userId:'user',lang:'en',onSaved:()=>{}}),
    React.createElement(CommunityReports,{client,lang:'en',onResolved:()=>{}}))));
  assert.match(document.body.textContent, /Stargazer|Approved/);
  assert.equal(document.querySelector('#community-name').value, 'Stargazer');
  assert.match(document.body.textContent, /Harmful content/);
  assert.doesNotMatch(document.body.textContent, /reporter_id/);
  const remove = [...document.querySelectorAll('button')].find(b => b.textContent === 'Remove reported post');
  await act(async () => remove.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  assert.ok(calls.some(([name,args]) => name === 'community_resolve_report' && args.report_id === 'report-1' && args.decision === 'removed'));
  assert.match(document.body.textContent, /Report resolved/);
  assert.match(document.body.textContent, /No open reports/);
  await act(async () => root.unmount()); dom.window.close();
});

test('science group view loads real client results and joins through the client', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
  for (const [key,value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const Groups = (await import('../src/community/ScienceGroups.tsx')).default;
  let joined = false; const writes = [];
  const group = {id:'g1',owner_id:'another',name:'Mars club',description:'Exploring Mars',category:'mars',status:'approved'};
  const client = { from(table) {
    if (table === 'community_groups') return {select:()=>({order:()=>({limit:async()=>({data:[group],error:null})})})};
    if (table === 'community_group_members') return {select:async()=>({data:joined?[{group_id:'g1',role:'member'}]:[],error:null}),insert:async values=>{writes.push(values);joined=true;return {error:null};}};
    if (table === 'community_posts') return {select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[],error:null})})})})};
    throw new Error(`unexpected table ${table}`);
  }};
  const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(Groups,{client,userId:'user',lang:'en',onChanged:()=>{}})));
  const card=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Mars club'));
  assert.ok(card);
  await act(async()=>card.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  const join=[...document.querySelectorAll('button')].find(b=>b.textContent==='Join');
  assert.ok(join);
  await act(async()=>join.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  assert.deepEqual(writes,[{group_id:'g1'}]);
  assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Leave'));
  await act(async()=>root.unmount()); dom.window.close();
});

test('private notifications render and mark a recipient item read', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
  for (const [key,value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React=(await import('react')).default; const {act}=await import('react'); const {createRoot}=await import('react-dom/client');
  const Notifications=(await import('../src/community/CommunityNotifications.tsx')).default;
  let item={id:'n1',event:'post_approved',created_at:'2026-11-08T00:00:00Z',read_at:null}; const updates=[];
  const client={from(table) { assert.equal(table,'community_notifications'); return {
    select:()=>({eq:(column,id)=>{assert.equal(column,'recipient_id');assert.equal(id,'u1');return {order:()=>({limit:async()=>({data:[item],error:null})})};}}),
    update:patch=>({eq:(column,id)=>({eq:async (owner,userId)=>{updates.push({column,id,owner,userId,patch});item={...item,...patch};return {error:null};}})})
  };}};
  const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(Notifications,{client,userId:'u1',lang:'en'})));
  assert.match(document.body.textContent,/Your post was approved/);
  const mark=[...document.querySelectorAll('button')].find(b=>b.textContent==='Mark as read');
  await act(async()=>mark.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  assert.equal(updates[0].userId,'u1'); assert.equal(updates[0].id,'n1'); assert.ok(updates[0].patch.read_at);
  assert.doesNotMatch(document.body.textContent,/Mark as read/);
  await act(async()=>root.unmount()); dom.window.close();
});

test('group owner promotes a member through the checked administration RPC', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/'});
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event})) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=(await import('react')).default; const {act}=await import('react'); const {createRoot}=await import('react-dom/client');
  const GroupAdmin=(await import('../src/community/GroupAdministration.tsx')).default;
  let roster=[{user_id:'owner-123',role:'owner',display_name:'Owner'},{user_id:'member-123',role:'member',display_name:'Explorer'}];const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='community_group_roster')return {data:roster,error:null};roster=roster.map(m=>m.user_id===args.target_user?{...m,role:'admin'}:m);return {data:true,error:null};}};
  const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(GroupAdmin,{client,groupId:'group-1',actorId:'owner-123',actorRole:'owner',lang:'en'})));
  assert.match(document.body.textContent,/Explorer/);
  const promote=[...document.querySelectorAll('button')].find(b=>b.textContent==='Make administrator'); assert.ok(promote);
  await act(async()=>promote.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  assert.ok(calls.some(c=>c.name==='community_group_manage' && c.args.action==='promote' && c.args.target_user==='member-123' && c.args.target_group==='group-1'));
  assert.match(document.body.textContent,/Remove administrator role/);
  await act(async()=>root.unmount()); dom.window.close();
});
