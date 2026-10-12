module.exports=async function persistNativeAI(pool,signal,write){
 const client=await pool.connect();try{await client.query('BEGIN');signal?.throwIfAborted();const result=await write(client);signal?.throwIfAborted();await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
};
