'use strict';
const path=require('node:path'),fs=require('node:fs');
const NOTICE='Fictional local planning draft only. No property inspection, clinical finding, AI assessment, consent, certification, contractor contact, quote response, approval, payment, or completed modification is claimed.';
async function seedNativePlanning({pool,actorId,env}){
 if(env.NODE_ENV==='production'||env.ENABLE_DEMO_CREDENTIAL_AUTOFILL==='false')return {enabled:false,added:0};
 const client=await pool.connect();let added=0;
 try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('aging-native-planning-drafts'))");const actor=await client.query('SELECT id FROM users WHERE id=$1',[actorId]);if(!actor.rows.length)throw Error('The configured native Demo account is missing. Existing accounts were preserved.');
  for(let i=1;i<=15;i++){
   const address=`Fictional planning home ${String(i).padStart(2,'0')} · no real property inspection`;
   let home=(await client.query('SELECT id FROM homes WHERE user_id=$1 AND address=$2',[actorId,address])).rows[0];
   if(!home){home=(await client.query('INSERT INTO homes(user_id,address,current_accessibility_score,year_built,sq_footage,num_floors) VALUES($1,$2,NULL,NULL,NULL,NULL) RETURNING id',[actorId,address])).rows[0];added++;}
   let profile=(await client.query('SELECT id FROM resident_profiles WHERE user_id=$1 AND home_id=$2',[actorId,home.id])).rows[0];
   if(!profile){profile=(await client.query('INSERT INTO resident_profiles(home_id,user_id,resident_name,age,mobility_issues,vision_issues,balance_issues,medical_notes) VALUES($1,$2,$3,NULL,NULL,NULL,NULL,$4) RETURNING id',[home.id,actorId,`Fictional planning profile ${i} · no actual resident`,NOTICE])).rows[0];added++;}
   if(!(await client.query('SELECT id FROM fall_risk_history WHERE user_id=$1 AND home_id=$2 AND planning_notes=$3',[actorId,home.id,NOTICE])).rows.length){await client.query('INSERT INTO fall_risk_history(home_id,user_id,fall_risk_score,risk_category,annual_fall_probability,five_year_fall_probability,ai_result,planning_notes) VALUES($1,$2,NULL,NULL,NULL,NULL,NULL,$3)',[home.id,actorId,NOTICE]);added++;}
   let assessment=(await client.query("SELECT id FROM assessments WHERE user_id=$1 AND home_id=$2 AND status='pending' AND ai_result IS NULL LIMIT 1",[actorId,home.id])).rows[0];
   if(!assessment){assessment=(await client.query("INSERT INTO assessments(home_id,user_id,assessment_type,status,ai_result,safety_score,urgency_level) VALUES($1,$2,'full','pending',NULL,NULL,NULL) RETURNING id",[home.id,actorId])).rows[0];added++;}
   let modification=(await client.query('SELECT id FROM modifications WHERE assessment_id=$1 AND notes=$2',[assessment.id,NOTICE])).rows[0];
   if(!modification){modification=(await client.query("INSERT INTO modifications(assessment_id,room,modification_type,description,status,completion_pct,priority,notes) VALUES($1,'Pending source review','planning_review',$2,'planned',0,5,$2) RETURNING id",[assessment.id,NOTICE])).rows[0];added++;}
   const contractorName=`Fictional unverified contractor prospect ${String(i).padStart(2,'0')}`;
   let contractor=(await client.query('SELECT id FROM contractors WHERE name=$1',[contractorName])).rows[0];
   if(!contractor){contractor=(await client.query("INSERT INTO contractors(name,specialty,license_number,phone,email,rating,review_count,zip_code,is_certified_aging_specialist) VALUES($1,'general',NULL,NULL,NULL,NULL,0,NULL,FALSE) RETURNING id",[contractorName])).rows[0];added++;}
   if(!(await client.query('SELECT id FROM cost_estimates WHERE modification_id=$1 AND notes=$2',[modification.id,NOTICE])).rows.length){await client.query('INSERT INTO cost_estimates(modification_id,labor_cost,materials_cost,timeline_days,roi_score,notes) VALUES($1,NULL,NULL,NULL,NULL,$2)',[modification.id,NOTICE]);added++;}
   if(!(await client.query('SELECT id FROM quotes WHERE user_id=$1 AND modification_id=$2 AND contractor_id=$3 AND notes=$4',[actorId,modification.id,contractor.id,NOTICE])).rows.length){await client.query("INSERT INTO quotes(modification_id,contractor_id,user_id,status,quote_amount,notes,requested_at,responded_at) VALUES($1,$2,$3,'pending',NULL,$4,NOW(),NULL)",[modification.id,contractor.id,actorId,NOTICE]);added++;}
   const key=`fictional-planning-${i}`,tenant=`user:${actorId}`,title=`Fictional care coordination planning draft ${i}`;
   if(!(await client.query('SELECT id FROM care_coordination_workflows WHERE tenant_id=$1 AND idempotency_key=$2',[tenant,key])).rows.length){
    const payload={residentReference:`profile:${profile.id}`,assessmentReference:`assessment:${assessment.id}`,schedule:'Unscheduled: awaiting a genuine care assessment and review',caregiverRoster:'Not supplied: no caregiver assignment is claimed',escalationRules:'Planning only: collect authorized escalation instructions before any transition',consentCurrent:false,automatedEmergencyAction:false,modelOutputTrusted:false,trainingNotice:NOTICE};
    await client.query("INSERT INTO care_coordination_workflows(tenant_id,created_by,title,status,payload,evidence,idempotency_key) VALUES($1,$2,$3,'draft',$4::jsonb,'[]'::jsonb,$5)",[tenant,String(actorId),title,JSON.stringify(payload),key]);added++;
   }
  }
  await client.query('COMMIT');return {enabled:true,actorId,added};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
module.exports={seedNativePlanning,NOTICE};
if(require.main===module){const env=require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../../.env')));env.NODE_ENV=process.env.NODE_ENV||env.NODE_ENV;const {Pool}=require('pg'),pool=new Pool({connectionString:env.DATABASE_URL,ssl:env.DB_SSL==='true'?{rejectUnauthorized:true}:false});const aliases=['DEMO','PROVISION_ADMIN','BOOTSTRAP_ADMIN','SEED_ADMIN','ADMIN'];const alias=aliases.find(key=>env[`${key}_EMAIL`]&&env[`${key}_PASSWORD`]);
 (async()=>{if(env.NODE_ENV==='production'||env.ENABLE_DEMO_CREDENTIAL_AUTOFILL==='false')return; if(!alias)throw Error('Configure a local Demo identity before adding planning drafts.');const user=(await pool.query('SELECT id,password_hash FROM users WHERE lower(email)=$1',[env[`${alias}_EMAIL`].trim().toLowerCase()])).rows[0];if(!user||!await require('bcryptjs').compare(env[`${alias}_PASSWORD`],user.password_hash))throw Error('Existing Demo credentials do not match; no password or role was changed.');const result=await seedNativePlanning({pool,actorId:user.id,env});console.log(`Native planning ready: ${result.added} new fictional draft rows; no assessed/approved/completed outcomes.`);})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());}
