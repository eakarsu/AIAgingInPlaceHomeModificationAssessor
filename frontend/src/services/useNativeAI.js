import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
export default function useNativeAI(owner){
 const active=useRef(new Set()),mounted=useRef(true);const [busy,setBusy]=useState(false);
 const cancel=useCallback(()=>{for(const controller of active.current)controller.abort();active.current.clear();if(mounted.current)setBusy(false);},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancel();};},[cancel,owner]);
 const post=useCallback(async(url,data)=>{const controller=new AbortController();active.current.add(controller);setBusy(true);try{const response=await api.post(url,data,{signal:controller.signal});if(controller.signal.aborted)throw new DOMException('Request cancelled.','AbortError');return response;}finally{active.current.delete(controller);if(mounted.current)setBusy(active.current.size>0);}},[]);
 return{post,cancel,busy};
}
