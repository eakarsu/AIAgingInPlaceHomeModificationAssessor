module.exports=function nativeAICancellation(req,res,next){
 const controller=new AbortController();req.aiSignal=controller.signal;
 const disconnected=()=>{if(!res.writableEnded)controller.abort();};
 req.once('aborted',disconnected);res.once('close',disconnected);res.once('finish',()=>{req.removeListener('aborted',disconnected);res.removeListener('close',disconnected);});
 next();
};
