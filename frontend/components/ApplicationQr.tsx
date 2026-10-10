'use client';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
export default function ApplicationQr({path,label}:{path:string;label:string}){
  const [image,setImage]=useState('');
  useEffect(()=>{let active=true;QRCode.toDataURL(new URL(path,location.origin).href,{width:180,margin:2})
    .then(v=>{if(active)setImage(v);}).catch(()=>{});return()=>{active=false;};},[path]);
  return <div><a href={path}>{label}</a>{image&&<div><img src={image} width={180} height={180} alt={label+' QR code'}/></div>}</div>;
}
