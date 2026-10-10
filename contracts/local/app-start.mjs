import {createApplication} from './app-session.mjs';
// Only the trusted frontend server owns this process. Private service calls travel over IPC.
console.log=(...v)=>console.error(...v);
const app=await createApplication({port:Number(process.argv[2]??0),origin:process.env.GIGVAULT_APP_ORIGIN??'http://localhost:3000'});
process.send?.({event:'ready',bundle:app.bundle});
let queue=Promise.resolve(),closed=false;
process.on('message',m=>{queue=queue.then(async()=>{
  try{
    if(closed)throw Error('SESSION_CLOSED');
    if(m.method==='close'){closed=true;await app.close();process.send({id:m.id,ok:true,result:{closed:true}},()=>process.exit(0));return;}
    const result=await app.dispatch(m.method,m.params);process.send({id:m.id,ok:true,result});
  }catch(e){process.send({id:m.id,ok:false,error:{code:e.code??'REQUEST_REJECTED',message:e.message??'Request rejected'}});}
});});
const stop=()=>{closed=true;queue=queue.then(async()=>{await app.close();process.exit(0);});};
process.once('disconnect',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop);
