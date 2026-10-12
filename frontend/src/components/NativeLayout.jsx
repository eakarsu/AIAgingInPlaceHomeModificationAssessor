import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AIReportLibrary from './AIReportLibrary';
import './NativeLayout.css';
const links=[['/','My Homes'],['/codex/operations','Care Operations'],['/contractors','Contractors'],['/codex/custom-viz','Record Insights'],['/evacuation-readiness','Evacuation Readiness'],['/custom-views','Custom Views']];
export default function NativeLayout({children}){
 const {user,logout}=useAuth();const navigate=useNavigate();
 return <div className="native-layout"><aside className="native-sidebar"><header><strong>Aging-in-Place</strong><span>Home modification planning</span></header><nav aria-label="Application navigation">{links.map(([to,label])=><NavLink to={to} end={to==='/'} key={to}>{label}</NavLink>)}<AIReportLibrary compact /></nav><footer><span>{user?.name||'Signed-in account'}</span><button type="button" onClick={()=>{logout();navigate('/login');}}>Sign Out</button></footer></aside><div className="native-page">{children}</div></div>;
}
