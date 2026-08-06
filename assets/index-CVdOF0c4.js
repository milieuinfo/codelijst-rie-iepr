(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const n of r.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&i(n)}).observe(document,{childList:!0,subtree:!0});function t(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function i(s){if(s.ep)return;s.ep=!0;const r=t(s);fetch(s.href,r)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Y=globalThis,ae=Y.ShadowRoot&&(Y.ShadyCSS===void 0||Y.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ce=Symbol(),fe=new WeakMap;let Ie=class{constructor(e,t,i){if(this._$cssResult$=!0,i!==ce)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(ae&&e===void 0){const i=t!==void 0&&t.length===1;i&&(e=fe.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&fe.set(t,e))}return e}toString(){return this.cssText}};const Oe=o=>new Ie(typeof o=="string"?o:o+"",void 0,ce),G=(o,...e)=>{const t=o.length===1?o[0]:e.reduce((i,s,r)=>i+(n=>{if(n._$cssResult$===!0)return n.cssText;if(typeof n=="number")return n;throw Error("Value passed to 'css' function must be a 'css' function result: "+n+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+o[r+1],o[0]);return new Ie(t,o,ce)},Me=(o,e)=>{if(ae)o.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const i=document.createElement("style"),s=Y.litNonce;s!==void 0&&i.setAttribute("nonce",s),i.textContent=t.cssText,o.appendChild(i)}},me=ae?o=>o:o=>o instanceof CSSStyleSheet?(e=>{let t="";for(const i of e.cssRules)t+=i.cssText;return Oe(t)})(o):o;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:Ve,defineProperty:Ne,getOwnPropertyDescriptor:Ue,getOwnPropertyNames:De,getOwnPropertySymbols:je,getPrototypeOf:ze}=Object,T=globalThis,ge=T.trustedTypes,He=ge?ge.emptyScript:"",ee=T.reactiveElementPolyfillSupport,z=(o,e)=>o,re={toAttribute(o,e){switch(e){case Boolean:o=o?He:null;break;case Object:case Array:o=o==null?o:JSON.stringify(o)}return o},fromAttribute(o,e){let t=o;switch(e){case Boolean:t=o!==null;break;case Number:t=o===null?null:Number(o);break;case Object:case Array:try{t=JSON.parse(o)}catch{t=null}}return t}},Te=(o,e)=>!Ve(o,e),ve={attribute:!0,type:String,converter:re,reflect:!1,useDefault:!1,hasChanged:Te};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),T.litPropertyMetadata??(T.litPropertyMetadata=new WeakMap);let N=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=ve){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const i=Symbol(),s=this.getPropertyDescriptor(e,i,t);s!==void 0&&Ne(this.prototype,e,s)}}static getPropertyDescriptor(e,t,i){const{get:s,set:r}=Ue(this.prototype,e)??{get(){return this[t]},set(n){this[t]=n}};return{get:s,set(n){const l=s==null?void 0:s.call(this);r==null||r.call(this,n),this.requestUpdate(e,l,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??ve}static _$Ei(){if(this.hasOwnProperty(z("elementProperties")))return;const e=ze(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(z("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(z("properties"))){const t=this.properties,i=[...De(t),...je(t)];for(const s of i)this.createProperty(s,t[s])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[i,s]of t)this.elementProperties.set(i,s)}this._$Eh=new Map;for(const[t,i]of this.elementProperties){const s=this._$Eu(t,i);s!==void 0&&this._$Eh.set(s,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const i=new Set(e.flat(1/0).reverse());for(const s of i)t.unshift(me(s))}else e!==void 0&&t.push(me(e));return t}static _$Eu(e,t){const i=t.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(t=>t(this))}addController(e){var t;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((t=e.hostConnected)==null||t.call(e))}removeController(e){var t;(t=this._$EO)==null||t.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const i of t.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Me(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(t=>{var i;return(i=t.hostConnected)==null?void 0:i.call(t)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(t=>{var i;return(i=t.hostDisconnected)==null?void 0:i.call(t)})}attributeChangedCallback(e,t,i){this._$AK(e,i)}_$ET(e,t){var r;const i=this.constructor.elementProperties.get(e),s=this.constructor._$Eu(e,i);if(s!==void 0&&i.reflect===!0){const n=(((r=i.converter)==null?void 0:r.toAttribute)!==void 0?i.converter:re).toAttribute(t,i.type);this._$Em=e,n==null?this.removeAttribute(s):this.setAttribute(s,n),this._$Em=null}}_$AK(e,t){var r,n;const i=this.constructor,s=i._$Eh.get(e);if(s!==void 0&&this._$Em!==s){const l=i.getPropertyOptions(s),a=typeof l.converter=="function"?{fromAttribute:l.converter}:((r=l.converter)==null?void 0:r.fromAttribute)!==void 0?l.converter:re;this._$Em=s;const c=a.fromAttribute(t,l.type);this[s]=c??((n=this._$Ej)==null?void 0:n.get(s))??c,this._$Em=null}}requestUpdate(e,t,i,s=!1,r){var n;if(e!==void 0){const l=this.constructor;if(s===!1&&(r=this[e]),i??(i=l.getPropertyOptions(e)),!((i.hasChanged??Te)(r,t)||i.useDefault&&i.reflect&&r===((n=this._$Ej)==null?void 0:n.get(e))&&!this.hasAttribute(l._$Eu(e,i))))return;this.C(e,t,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:i,reflect:s,wrapped:r},n){i&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,n??t??this[e]),r!==!0||n!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(t=void 0),this._$AL.set(e,t)),s===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var i;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[r,n]of this._$Ep)this[r]=n;this._$Ep=void 0}const s=this.constructor.elementProperties;if(s.size>0)for(const[r,n]of s){const{wrapped:l}=n,a=this[r];l!==!0||this._$AL.has(r)||a===void 0||this.C(r,void 0,n,a)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),(i=this._$EO)==null||i.forEach(s=>{var r;return(r=s.hostUpdate)==null?void 0:r.call(s)}),this.update(t)):this._$EM()}catch(s){throw e=!1,this._$EM(),s}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;(t=this._$EO)==null||t.forEach(i=>{var s;return(s=i.hostUpdated)==null?void 0:s.call(i)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(t=>this._$ET(t,this[t]))),this._$EM()}updated(e){}firstUpdated(e){}};N.elementStyles=[],N.shadowRootOptions={mode:"open"},N[z("elementProperties")]=new Map,N[z("finalized")]=new Map,ee==null||ee({ReactiveElement:N}),(T.reactiveElementVersions??(T.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const H=globalThis,$e=o=>o,J=H.trustedTypes,be=J?J.createPolicy("lit-html",{createHTML:o=>o}):void 0,xe="$lit$",I=`lit$${Math.random().toFixed(9).slice(2)}$`,Pe="?"+I,Fe=`<${Pe}>`,V=document,F=()=>V.createComment(""),B=o=>o===null||typeof o!="object"&&typeof o!="function",de=Array.isArray,Be=o=>de(o)||typeof(o==null?void 0:o[Symbol.iterator])=="function",te=`[ 	
\f\r]`,j=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,ye=/-->/g,_e=/>/g,P=RegExp(`>|${te}(?:([^\\s"'>=/]+)(${te}*=${te}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Se=/'/g,Ae=/"/g,Le=/^(?:script|style|textarea|title)$/i,qe=o=>(e,...t)=>({_$litType$:o,strings:e,values:t}),d=qe(1),U=Symbol.for("lit-noChange"),p=Symbol.for("lit-nothing"),Ce=new WeakMap,L=V.createTreeWalker(V,129);function Re(o,e){if(!de(o)||!o.hasOwnProperty("raw"))throw Error("invalid template strings array");return be!==void 0?be.createHTML(e):e}const We=(o,e)=>{const t=o.length-1,i=[];let s,r=e===2?"<svg>":e===3?"<math>":"",n=j;for(let l=0;l<t;l++){const a=o[l];let c,h,u=-1,f=0;for(;f<a.length&&(n.lastIndex=f,h=n.exec(a),h!==null);)f=n.lastIndex,n===j?h[1]==="!--"?n=ye:h[1]!==void 0?n=_e:h[2]!==void 0?(Le.test(h[2])&&(s=RegExp("</"+h[2],"g")),n=P):h[3]!==void 0&&(n=P):n===P?h[0]===">"?(n=s??j,u=-1):h[1]===void 0?u=-2:(u=n.lastIndex-h[2].length,c=h[1],n=h[3]===void 0?P:h[3]==='"'?Ae:Se):n===Ae||n===Se?n=P:n===ye||n===_e?n=j:(n=P,s=void 0);const m=n===P&&o[l+1].startsWith("/>")?" ":"";r+=n===j?a+Fe:u>=0?(i.push(c),a.slice(0,u)+xe+a.slice(u)+I+m):a+I+(u===-2?l:m)}return[Re(o,r+(o[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),i]};class q{constructor({strings:e,_$litType$:t},i){let s;this.parts=[];let r=0,n=0;const l=e.length-1,a=this.parts,[c,h]=We(e,t);if(this.el=q.createElement(c,i),L.currentNode=this.el.content,t===2||t===3){const u=this.el.content.firstChild;u.replaceWith(...u.childNodes)}for(;(s=L.nextNode())!==null&&a.length<l;){if(s.nodeType===1){if(s.hasAttributes())for(const u of s.getAttributeNames())if(u.endsWith(xe)){const f=h[n++],m=s.getAttribute(u).split(I),$=/([.?@])?(.*)/.exec(f);a.push({type:1,index:r,name:$[2],strings:m,ctor:$[1]==="."?Ke:$[1]==="?"?Ye:$[1]==="@"?Je:Q}),s.removeAttribute(u)}else u.startsWith(I)&&(a.push({type:6,index:r}),s.removeAttribute(u));if(Le.test(s.tagName)){const u=s.textContent.split(I),f=u.length-1;if(f>0){s.textContent=J?J.emptyScript:"";for(let m=0;m<f;m++)s.append(u[m],F()),L.nextNode(),a.push({type:2,index:++r});s.append(u[f],F())}}}else if(s.nodeType===8)if(s.data===Pe)a.push({type:2,index:r});else{let u=-1;for(;(u=s.data.indexOf(I,u+1))!==-1;)a.push({type:7,index:r}),u+=I.length-1}r++}}static createElement(e,t){const i=V.createElement("template");return i.innerHTML=e,i}}function D(o,e,t=o,i){var n,l;if(e===U)return e;let s=i!==void 0?(n=t._$Co)==null?void 0:n[i]:t._$Cl;const r=B(e)?void 0:e._$litDirective$;return(s==null?void 0:s.constructor)!==r&&((l=s==null?void 0:s._$AO)==null||l.call(s,!1),r===void 0?s=void 0:(s=new r(o),s._$AT(o,t,i)),i!==void 0?(t._$Co??(t._$Co=[]))[i]=s:t._$Cl=s),s!==void 0&&(e=D(o,s._$AS(o,e.values),s,i)),e}class Ge{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:i}=this._$AD,s=((e==null?void 0:e.creationScope)??V).importNode(t,!0);L.currentNode=s;let r=L.nextNode(),n=0,l=0,a=i[0];for(;a!==void 0;){if(n===a.index){let c;a.type===2?c=new K(r,r.nextSibling,this,e):a.type===1?c=new a.ctor(r,a.name,a.strings,this,e):a.type===6&&(c=new Xe(r,this,e)),this._$AV.push(c),a=i[++l]}n!==(a==null?void 0:a.index)&&(r=L.nextNode(),n++)}return L.currentNode=V,s}p(e){let t=0;for(const i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,t),t+=i.strings.length-2):i._$AI(e[t])),t++}}class K{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,t,i,s){this.type=2,this._$AH=p,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=i,this.options=s,this._$Cv=(s==null?void 0:s.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=D(this,e,t),B(e)?e===p||e==null||e===""?(this._$AH!==p&&this._$AR(),this._$AH=p):e!==this._$AH&&e!==U&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Be(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==p&&B(this._$AH)?this._$AA.nextSibling.data=e:this.T(V.createTextNode(e)),this._$AH=e}$(e){var r;const{values:t,_$litType$:i}=e,s=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=q.createElement(Re(i.h,i.h[0]),this.options)),i);if(((r=this._$AH)==null?void 0:r._$AD)===s)this._$AH.p(t);else{const n=new Ge(s,this),l=n.u(this.options);n.p(t),this.T(l),this._$AH=n}}_$AC(e){let t=Ce.get(e.strings);return t===void 0&&Ce.set(e.strings,t=new q(e)),t}k(e){de(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let i,s=0;for(const r of e)s===t.length?t.push(i=new K(this.O(F()),this.O(F()),this,this.options)):i=t[s],i._$AI(r),s++;s<t.length&&(this._$AR(i&&i._$AB.nextSibling,s),t.length=s)}_$AR(e=this._$AA.nextSibling,t){var i;for((i=this._$AP)==null?void 0:i.call(this,!1,!0,t);e!==this._$AB;){const s=$e(e).nextSibling;$e(e).remove(),e=s}}setConnected(e){var t;this._$AM===void 0&&(this._$Cv=e,(t=this._$AP)==null||t.call(this,e))}}class Q{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,i,s,r){this.type=1,this._$AH=p,this._$AN=void 0,this.element=e,this.name=t,this._$AM=s,this.options=r,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=p}_$AI(e,t=this,i,s){const r=this.strings;let n=!1;if(r===void 0)e=D(this,e,t,0),n=!B(e)||e!==this._$AH&&e!==U,n&&(this._$AH=e);else{const l=e;let a,c;for(e=r[0],a=0;a<r.length-1;a++)c=D(this,l[i+a],t,a),c===U&&(c=this._$AH[a]),n||(n=!B(c)||c!==this._$AH[a]),c===p?e=p:e!==p&&(e+=(c??"")+r[a+1]),this._$AH[a]=c}n&&!s&&this.j(e)}j(e){e===p?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class Ke extends Q{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===p?void 0:e}}class Ye extends Q{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==p)}}class Je extends Q{constructor(e,t,i,s,r){super(e,t,i,s,r),this.type=5}_$AI(e,t=this){if((e=D(this,e,t,0)??p)===U)return;const i=this._$AH,s=e===p&&i!==p||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,r=e!==p&&(i===p||s);s&&this.element.removeEventListener(this.name,this,i),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;typeof this._$AH=="function"?this._$AH.call(((t=this.options)==null?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}}class Xe{constructor(e,t,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){D(this,e)}}const ie=H.litHtmlPolyfillSupport;ie==null||ie(q,K),(H.litHtmlVersions??(H.litHtmlVersions=[])).push("3.3.3");const Ze=(o,e,t)=>{const i=(t==null?void 0:t.renderBefore)??e;let s=i._$litPart$;if(s===void 0){const r=(t==null?void 0:t.renderBefore)??null;i._$litPart$=s=new K(e.insertBefore(F(),r),r,void 0,t??{})}return s._$AI(o),s};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const O=globalThis;class M extends N{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Ze(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return U}}var ke;M._$litElement$=!0,M.finalized=!0,(ke=O.litElementHydrateSupport)==null||ke.call(O,{LitElement:M});const se=O.litElementPolyfillSupport;se==null||se({LitElement:M});(O.litElementVersions??(O.litElementVersions=[])).push("4.2.2");const we=767,he=G`
    .vl-margin--small {
        margin: var(--vl-spacing--small) 0;

        @media screen and (max-width: ${we}px) {
            margin: var(--vl-spacing--normal) 0;
        }
    }

    .vl-margin--medium {
        margin: var(--vl-spacing--medium) 0;

        @media screen and (max-width: ${we}px) {
            margin: var(--vl-spacing--normal) 0;
        }
    }

    .vl-margin--no {
        margin: 0;
    }

    .vl-margin--no-bottom {
        margin-bottom: 0;
    }

    .vl-margin--no-top {
        margin-top: 0;
    }
`,Qe=G`
:root {
  --vl-theme-primary-color: #ffe615;
  --vl-theme-primary-color-60: #fff073;
  --vl-theme-primary-color-70: #ffee5b;
  --vl-theme-primary-color-rgba-30: rgba(255, 230, 21, 0.3);
  --vl-theme-fg-color: #333332;
  --vl-theme-fg-color-60: #858584;
  --vl-theme-fg-color-70: #707070;
}

.vl-vi::before, .vl-vi::after {
  font-family: "vlaanderen-icon" !important;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-style: normal;
  font-variant: normal;
  font-weight: normal;
  text-decoration: none;
  text-transform: none;
  display: inline-block;
  vertical-align: middle;
}
.vl-vi.vl-vi-u-180deg::before {
  display: inline-block;
  transform: rotate(180deg);
  vertical-align: middle;
}

.vl-vi-u-xs::before {
  font-size: 0.8rem;
}

.vl-vi-u-s::before {
  font-size: 1.3rem;
}

.vl-vi-u-m::before {
  font-size: 1.7rem;
}

.vl-vi-u-l::before {
  font-size: 2rem;
}

.vl-vi-u-xl::before {
  font-size: 2.2rem;
}

.vl-vi-u-90deg::before {
  display: inline-block;
  transform: rotate(90deg);
}

.vl-vi-u-180deg::before {
  display: inline-block;
  transform: rotate(180deg);
}

.vl-page {
  position: relative;
  width: 100%;
  background-color: #fff;
}
.vl-page .vl-main-content > .vl-region:last-child {
  padding-bottom: 10rem;
}
@media screen and (max-width: 767px) {
  .vl-page .vl-main-content > .vl-region:last-child {
    padding-bottom: 7rem;
  }
}

.vl-main-content {
  outline: none;
  position: relative;
}

.vl-region {
  margin: 0 auto;
  padding: 3rem 0 6rem;
}
@media screen and (max-width: 767px) {
  .vl-region {
    padding: 3rem 0;
  }
}

.vl-region:not(.vl-region--alt) + .vl-region:not(.vl-region--alt) {
  padding-top: 0;
}

.vl-region--alt {
  background-color: #f7f9fc;
}

.vl-region--overlap {
  background: linear-gradient(to bottom, transparent calc(50% - 30px), #f7f9fc calc(50% - 30px), #f7f9fc 100%);
  filter: progid:DXImageTransform.Microsoft.gradient( startColorstr="#00000000", endColorstr="#000000",GradientType=0 );
}
.vl-region--overlap .vl-layout {
  border: 1px #cbd2da solid;
  padding-top: 50px;
  padding-bottom: 50px;
  background: #fff;
}
@media only screen and (max-width: 1295px) {
  .vl-region--overlap .vl-layout {
    margin: 15px;
  }
}
@media screen and (max-width: 1023px) {
  .vl-region--overlap .vl-layout {
    padding-top: 20px;
    padding-bottom: 20px;
  }
}

.vl-region--overlap + .vl-region--alt {
  padding-top: 0 !important;
}

.vl-region:not(.vl-region--alt) + .vl-region--alt,
.vl-region--alt + .vl-region:not(.vl-region--alt) {
  padding-top: 6rem;
}
@media screen and (max-width: 767px) {
  .vl-region:not(.vl-region--alt) + .vl-region--alt,
  .vl-region--alt + .vl-region:not(.vl-region--alt) {
    padding-top: 3rem;
  }
}

.vl-region:first-child {
  padding-top: 6rem;
}
@media screen and (max-width: 767px) {
  .vl-region:first-child {
    padding-top: 2rem;
  }
}

.vl-region--small {
  padding: 1.5rem 0;
}
@media screen and (max-width: 767px) {
  .vl-region--small {
    padding: 2rem 0;
  }
}

.vl-region--medium {
  padding: 3rem 0;
}
@media screen and (max-width: 767px) {
  .vl-region--medium {
    padding: 2rem 0;
  }
}

.vl-region--bordered + .vl-region--bordered {
  border-top: 1px solid #f7f9fc;
}
.vl-region--bordered + .vl-region--bordered.vl-region--alt {
  border-top-color: #fff;
}

.vl-region.vl-region--no-space {
  padding: 0;
}

.vl-region.vl-region--no-space-bottom {
  padding-bottom: 0;
}

.vl-region.vl-region--no-space-top {
  padding-top: 0;
}

.vl-layout {
  position: relative;
  margin: 0 auto;
  min-width: 1024px;
  max-width: 1280px;
  padding: 0 3rem;
}
@media screen and (max-width: 1023px) {
  .vl-layout {
    width: auto;
    min-width: 768px;
    max-width: 1280px;
  }
}
@media screen and (max-width: 767px) {
  .vl-layout {
    width: auto;
    min-width: 0;
    padding: 0 1.5rem;
  }
}
`,et=["skos:ConceptScheme"],tt=["skos:Concept"];class pe{constructor(){this.resourcePath="resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/",this.fileName="rie-iepr.jsonld"}getAppBase(){const e=window.location.pathname,t=e.lastIndexOf("/");return e.substring(0,t+1)||"/"}async loadCodelist(e={}){const t=e.normalizeBooleans??!0,i=this.getAppBase()+this.resourcePath+this.fileName,s=await fetch(i);if(!s.ok)throw new Error(`Failed to fetch codelist: ${s.status} ${s.statusText}`);const r=await s.json();return this.parseData(r,t)}parseData(e,t){const i=Array.isArray(e.graph)?e.graph:e.graph?[e.graph]:[],s=this.buildNodeIndex(i),r=new Map,n=new Map;for(const[a,c]of s.entries()){const h=this.getTypes(c);h.some(u=>et.includes(u))&&r.set(a,this.toScheme(c)),h.some(u=>tt.includes(u))&&n.set(a,this.toConcept(c,t))}const l=new Map;for(const[a,c]of s.entries()){const h=c.hasTopConcept??c.has_top_concept;if(!h)continue;const u=Array.isArray(h)?h:[h],f=[];for(const m of u){const $=this.idOf(m),v=$?n.get($):void 0;v&&f.push(v)}l.set(a,f)}return{nodesById:s,schemes:r,concepts:n,topConcepts:l}}buildNodeIndex(e){const t=new Map,i=new Set,s=r=>{if(Array.isArray(r)){for(const a of r)s(a);return}if(!r||typeof r!="object"||i.has(r))return;i.add(r);const n=r,l=this.idOf(n);if(l){const a=t.get(l);if(a)for(const[c,h]of Object.entries(n))a[c]===void 0&&(a[c]=h);else t.set(l,{...n})}for(const a of Object.values(n))s(a)};return s(e),t}idOf(e){if(typeof e=="string")return e;if(e&&typeof e=="object"){const t=e["@id"]??e.id;return typeof t=="string"?t:void 0}}getTypes(e){const t=e["@type"]??e._type;return t?Array.isArray(t)?t.filter(i=>typeof i=="string"):[String(t)]:[]}toScheme(e){return{id:String(this.idOf(e)),type:this.getTypes(e),prefLabel:this.getValue(e,["prefLabel","has_pref_label"]),definition:this.getValue(e,["definition","has_definition"]),note:this.getValue(e,["note","has_note"]),relevantRiepr:this.idsOf(this.getValue(e,["relevantRiepr","relevant_riepr"])),seeAlso:this.idsOf(this.getValue(e,["seeAlso","see_also"]))}}toConcept(e,t){const i={id:String(this.idOf(e)),type:this.getTypes(e),inScheme:this.idOf(this.getValue(e,["inScheme","in_scheme"])),code:this.getValue(e,["code","notation"]),prefLabel:this.getValue(e,["prefLabel","has_pref_label"]),altLabel:this.getValue(e,["altLabel","alt_label"]),definition:this.getValue(e,["definition","has_definition"]),note:this.getValue(e,["note","has_note"]),isPartOf:this.idsOf(this.getValue(e,["isPartOf","broader"])),narrower:this.idsOf(this.getValue(e,["narrower"])),topConceptOf:this.idOf(this.getValue(e,["topConceptOf","top_concept_of"])),narrowerTransitive:this.idsOf(this.getValue(e,["narrowerTransitive","narrower_transitive"])),semanticRelation:this.idsOf(this.getValue(e,["semanticRelation","semantic_relation"])),relevantProperty:this.getValue(e,["relevantProperty","relevant_property"])},s=this.getValue(e,["relevantDataType","relevant_data_type"]);i.relevantDataType=typeof s=="string"?s:void 0;const r=this.idsOf(this.getValue(e,["conditionPath","condition_path"]))??[];i.conditionPath=r.length>0?r[0]:void 0;const n=this.idsOf(this.getValue(e,["conditionValue","condition_value"]))??[];return i.conditionValue=n.length>0?this.normalizeConditionValue(n[0]):void 0,i.relevantCodeList=this.idsOf(this.getValue(e,["relevantCodeList","relevant_code_list"])),i.relevantRiepr=this.idsOf(this.getValue(e,["relevantRiepr","relevant_riepr"])),i.relevantUnit=this.idsOf(this.getValue(e,["relevantUnit","relevant_unit"])),i.seeAlso=this.idsOf(this.getValue(e,["seeAlso","see_also"])),i.relevantClass=typeof this.getValue(e,["relevantClass","relevant_class"])=="string"?String(this.getValue(e,["relevantClass","relevant_class"])):void 0,t?(i.isVerplicht=this.parseBoolean(this.getValue(e,["isVerplicht","is_verplicht"])),i.isMeervoudig=this.parseBoolean(this.getValue(e,["isMeervoudig","is_meervoudig"])),i.isMeetbaar=this.parseBoolean(this.getValue(e,["isMeetbaar","is_meetbaar"])),i.isOnzichtbaar=this.parseBoolean(this.getValue(e,["isOnzichtbaar","is_onzichtbaar"])),i.isMultiselect=this.parseBoolean(this.getValue(e,["isMultiselect","is_multiselect"]))):(i.isVerplicht=this.getValue(e,["isVerplicht","is_verplicht"]),i.isMeervoudig=this.getValue(e,["isMeervoudig","is_meervoudig"]),i.isMeetbaar=this.getValue(e,["isMeetbaar","is_meetbaar"]),i.isOnzichtbaar=this.getValue(e,["isOnzichtbaar","is_onzichtbaar"]),i.isMultiselect=this.getValue(e,["isMultiselect","is_multiselect"])),i}idsOf(e){if(e==null)return;const s=(Array.isArray(e)?e:[e]).flatMap(r=>typeof r=="string"&&r.includes(",")?r.split(",").map(n=>n.trim()).filter(Boolean):[r]).map(r=>this.idOf(r)).filter(r=>r!==void 0);return s.length>0?s:void 0}parseBoolean(e){if(e!=null){if(typeof e=="boolean")return e;if(typeof e=="string"){const t=e.toLowerCase().trim();if(t==="true"||t==="1")return!0;if(t==="false"||t==="0")return!1}}}normalizeConditionValue(e){if(/^(true|false)$/i.test(e.trim()))return e.trim().toLowerCase();let t=null;const i=e.match(/#[^#/]+$/);if(i)t=i[0].substring(1);else{const s=e.match(/\/([^/?#]+)\s*$/);if(s&&(t=s[1]),!t&&!e.includes("://")){const r=e.indexOf(":");r>0&&r<e.length-1&&(t=e.substring(r+1))}}return t?t.trim().toLowerCase():e.trim()}getValue(e,t){for(const i of t)if(e[i]!==void 0)return e[i]}getSchemes(e){return Array.from(e.schemes.values())}getScheme(e,t){return e.schemes.get(t)}getConcept(e,t){return e.concepts.get(t)}getConceptsForScheme(e,t){const i=[];for(const s of e.concepts.values())s.inScheme===t&&i.push(s);return i}getTopConceptsForScheme(e,t){return e.topConcepts.get(t)||[]}getTopLevelConcepts(e,t){return this.getTopConceptsForScheme(e,t).filter(i=>{var s;return!((s=i.isPartOf)!=null&&s.length)})}getChildren(e,t){return t.narrower?t.narrower.map(i=>e.concepts.get(i)).filter(i=>i!==void 0):[]}getParent(e,t){var s;const i=(s=t.isPartOf)==null?void 0:s[0];return i?e.concepts.get(i)??null:null}getCodeListSchemes(e,t){return t.relevantCodeList?t.relevantCodeList.map(i=>e.schemes.get(i)).filter(i=>i!==void 0):[]}getRelevantRieprRefs(e,t){return t.relevantRiepr?t.relevantRiepr.map(i=>e.schemes.get(i)??e.concepts.get(i)).filter(i=>i!==void 0):[]}getSeeAlsoRefs(e,t){return t.seeAlso?t.seeAlso.map(i=>e.schemes.get(i)??e.concepts.get(i)).filter(i=>i!==void 0):[]}resolveOperationeelSchemeId(e,t){const i=this.getSeeAlsoRefs(e,t).filter(n=>{var l;return(l=n.type)==null?void 0:l.includes("skos:ConceptScheme")});if(i.length>0)return i[0].id;const r=this.getRelevantRieprRefs(e,t).find(n=>{var l;return(l=n.type)==null?void 0:l.includes("skos:ConceptScheme")});return r==null?void 0:r.id}}const Ee="conceptscheme:thema_type",X=class X extends M{get _service(){return this.codelistService??(this.codelistService=new pe)}render(){if(!this.result)return d`<vl-select id="thema" name="thema" label="Thema" disabled></vl-select>`;const e=this.result.schemes.get(Ee),t=(e==null?void 0:e.prefLabel)??"Thema",i=this._service.getTopLevelConcepts(this.result,Ee).map(n=>({value:n.id,label:n.prefLabel??n.id,selected:n.id===this.selectedThemeId})),s=this.selectedThemeId?this.result.concepts.get(this.selectedThemeId):void 0,r=s?this._service.getChildren(this.result,s):[];return d`
      <vl-form-label for="thema" label="${t}" block .annotation="${(e==null?void 0:e.definition)??""}"></vl-form-label>
      <vl-select
        id="thema"
        name="thema"
        placeholder="Selecteer een thema..."
        .options="${i}"
        .value="${this.selectedThemeId??""}"
        @vl-input="${this._onThemaInput}"
      ></vl-select>

      ${r.length>0?d`
            <div class="vl-margin--medium">
              <vl-form-label for="sub-thema" label="Sub-thema" block .annotation="${(s==null?void 0:s.definition)??""}"></vl-form-label>
              <vl-select
                id="sub-thema"
                name="sub-thema"
                placeholder="Selecteer een sub-thema..."
                .options="${r.map(n=>({value:n.id,label:n.prefLabel??n.id,selected:n.id===this.selectedSubThemeId}))}"
                .value="${this.selectedSubThemeId??""}"
                @vl-input="${this._onSubThemaInput}"
              ></vl-select>
            </div>
          `:""}
    `}_onThemaInput(e){this.selectedThemeId=e.detail.value||void 0,this.selectedSubThemeId=void 0,this._emitSelection()}_onSubThemaInput(e){this.selectedSubThemeId=e.detail.value||void 0,this._emitSelection()}_emitSelection(){this.dispatchEvent(new CustomEvent("theme-select",{bubbles:!0,composed:!0,detail:{themeId:this.selectedThemeId,subThemeId:this.selectedSubThemeId}}))}};X.styles=[he,G`
    :host {
      display: block;
    }
  `],X.properties={result:{attribute:!1},selectedThemeId:{attribute:!1},selectedSubThemeId:{attribute:!1},codelistService:{attribute:!1}};let ne=X;customElements.define("codelijst-theme-selector",ne);const _={BOOLEAN:"xsd:boolean",DATE:"xsd:date",DATETIME:"xsd:dateTime",TEMPORAL_RANGE:"dcterms:temporal",NUMERIC:["xsd:decimal","xsd:integer","xsd:double","xsd:float"],DURATION:"xsd:duration",TEXT:"default"},R={[_.BOOLEAN]:(o,e,t,i)=>d`<vl-checkbox id="${o}" name="${e}" label="${t}" ?required="${i}"></vl-checkbox>`,[_.DATE]:(o,e,t,i)=>d`<vl-datepicker id="${o}" name="${e}" label="${t}" ?required="${i}"></vl-datepicker>`,[_.DATETIME]:(o,e,t,i)=>d`<vl-datepicker id="${o}" name="${e}" label="${t}" type="date-time" ?required="${i}"></vl-datepicker>`,[_.TEMPORAL_RANGE]:(o,e,t,i)=>d`<vl-datepicker id="${o}" name="${e}" label="${t}" type="range" ?required="${i}"></vl-datepicker>`};for(const o of _.NUMERIC)R[o]=(e,t,i,s)=>d`<vl-input-field id="${e}" name="${t}" label="${i}" type="number" ?required="${s}"></vl-input-field>`;R[_.DURATION]=(o,e,t,i)=>d`<vl-input-field id="${o}" name="${e}" label="${t}" type="text" pattern="[0-9]+:[0-2][0-9]:[0-5][0-9]:[0-5][0-9]" placeholder="dd:hh:mm:ss" ?required="${i}"></vl-input-field>`;R[_.TEXT]=(o,e,t,i)=>d`<vl-input-field id="${o}" name="${e}" label="${t}" type="text" ?required="${i}"></vl-input-field>`;const W={[_.BOOLEAN]:(o,e,t,i,s)=>d`<vl-checkbox id="${o}" name="${e}" label="${t}" ?required="${i}" @vl-change="${s}"></vl-checkbox>`,[_.DATE]:(o,e,t,i,s)=>d`<vl-datepicker id="${o}" name="${e}" label="${t}" ?required="${i}" @vl-input="${s}"></vl-datepicker>`,[_.DATETIME]:(o,e,t,i,s)=>d`<vl-datepicker id="${o}" name="${e}" label="${t}" type="date-time" ?required="${i}" @vl-input="${s}"></vl-datepicker>`,[_.TEMPORAL_RANGE]:(o,e,t,i,s)=>d`<vl-datepicker id="${o}" name="${e}" label="${t}" type="range" ?required="${i}" @vl-input="${s}"></vl-datepicker>`};for(const o of _.NUMERIC)W[o]=(e,t,i,s,r)=>d`<vl-input-field id="${e}" name="${t}" label="${i}" type="number" ?required="${s}" @vl-input="${r}"></vl-input-field>`;W[_.DURATION]=(o,e,t,i,s)=>d`<vl-input-field id="${o}" name="${e}" label="${t}" type="text" pattern="[0-9]+:[0-2][0-9]:[0-5][0-9]:[0-5][0-9]" placeholder="dd:hh:mm:ss" ?required="${i}" @vl-input="${s}"></vl-input-field>`;W[_.TEXT]=(o,e,t,i,s)=>d`<vl-input-field id="${o}" name="${e}" label="${t}" type="text" ?required="${i}" @vl-input="${s}"></vl-input-field>`;function it(o,e,t,i,s,r){var l;const n=s??_.TEXT;return r!==void 0&&W[n]?W[n](o,e,t,i,r):((l=R[n])==null?void 0:l.call(R,o,e,t,i))??R[_.TEXT](o,e,t,i)}const st={"riepr-meetpunt-type:debietmeter":["Debietmeter DM-01 (Pompput 1 - FL koeltoren)","Debietmeter DM-02 (Pompput 2 - onderhoud)","Debietmeter DM-03 (Pompput 3 - VT verzending)"],"riepr-meetpunt-type:controleinrichting":["Controleinrichting LP01 Industrieel glasfabriek","Controleinrichting LP02 Industrieel Kempenglas","Controleinrichting LP07 Industrieel Coater"],"riepr-meetpunt-type:peilput":["Peilput PP-01","Peilput PP-02"],"riepr-installatie-type:installatie":["GLASOVEN","Centrifuge","Demi-installatie glasfabriek","ETSLIJN 1 etsafdeling"],"riepr-installatie-type:waterzuivering":["Waterzuiveringsinstallatie"],"riepr-installatie-type:luchtzuivering":["Electrofilter","SCR","Wastoren etslijn 1","Naverbrander"],"riepr-emissiepunt-type:lozingspunt":["LP01 Industrieel glasfabriek","LP02 Industrieel Kempenglas","LP07 Industrieel Coater"],"riepr-emissiepunt-type:schoorsteen":["Schouw glasoven","Schouw naverbrander"],"riepr-onttrekkingspunt-type:pompput":["Pompput 1 (FL koeltoren)","Pompput 2 (onderhoud)","Pompput 3 (VT verzending)"],"riepr-onttrekkingspunt-type:opnamepunt":["Opgenomen oppervlaktewater"],"riepr:Installatie":["GLASOVEN","Centrifuge","Demi-installatie glasfabriek","ETSLIJN 1 etsafdeling"],"https://data.vlaanderen.be/ns/rie-pr#Installatie":["GLASOVEN","Centrifuge","Demi-installatie glasfabriek","ETSLIJN 1 etsafdeling"],"riepr-filter-type:peil":["Peilfilter PF-01","Peilfilter PF-02"],"riepr-filter-type:pomp":["Pompput PP-01","Pompput PP-02","Pompput PP-03"],"riepr-meetpunt-eigenschappen:referentiepunt":["Referentiepunt RPT-01 (terrasniveau)"]};function E(o,e){return(st[o]??[1,2,3].map(s=>`${e} ${s}`)).map((s,r)=>({id:`${o}#mock-${r+1}`,label:s}))}const rt={"unit:M3":"m³","unit:M3-PER-YR":"m³/jaar","unit:DAY":"dag","qudt-unit:GigaJ":"GJ","http://TODO":""};function nt(o){const e=rt[o];return typeof e=="string"&&e!==""?e:void 0}const Z=class Z extends M{constructor(){super(...arguments),this.repeatCounts=new Map,this._fieldValues=new Map,this.structuralSelections=new Map,this._structuralHandlerRunning=!1}willUpdate(e){e.has("schemeId")&&this._prevSchemeId!==this.schemeId&&(this._fieldValues.clear(),this.structuralSelections.clear(),this.repeatCounts.clear(),this._prevSchemeId=this.schemeId)}get _service(){return this.codelistService??(this.codelistService=new pe)}sortRootFieldsByConditionDependencies(e){const t=new Map;for(const r of e)r.conditionPath&&r.conditionValue&&t.set(r.conditionPath,r.id);const i=[],s=[];for(const r of e)!r.conditionPath||!t.has(r.conditionPath)?i.push(r):s.push(r);return[...i,...s]}render(){var a;if(!this.result||!this.schemeId)return p;const e=this.result.schemes.get(this.schemeId);if(!e)return p;let t=this._service.getTopLevelConcepts(this.result,this.schemeId);t.length===0&&((a=e.relevantRiepr)!=null&&a.length)&&(t=this.expandSchemeRelevantRieprToFields(e)),t=this.sortRootFieldsByConditionDependencies(t);const i=this.renderStructuralPicker(e),s=i!==p,r=new Set;for(const c of this.collectAllStructuralConceptIds(e,t))r.add(c);const n=s&&r.size>0;if(!i&&t.length===0)return d`<p class="vl-margin--small">Voor dit thema zijn geen operationele velden gedefinieerd in de codelist.</p>`;const l=t.map(c=>this.renderRootFieldContent(c)).filter(c=>c!==p);if(!i&&l.length===0)return d`<p class="vl-margin--small">Voor dit thema zijn geen operationele velden gedefinieerd in de codelist.</p>`;if(n&&!this.anyStructuralSelected()){const c=this.getGateInstructionMessage(e,t);return d`
        ${i}
        <p class="vl-margin--small">${c}</p>
      `}return d`
      ${i}
      ${l.map(c=>d`<div class="codelijst-group ${c.repeatable?"codelijst-repeatable-group":""}">${c.content}</div>`)}
    `}renderStructuralPicker(e){return this.result?this.renderPickersForRefs(this._service.getRelevantRieprRefs(this.result,e)):p}renderPickersForRefs(e,t){if(!this.result)return p;const s=e.filter(r=>Array.isArray(r.type)&&r.type.includes("skos:Concept")).filter(r=>E(r.id,r.prefLabel??r.id).length>0);return s.length===0?p:d`
      ${s.map(r=>{const n=r.prefLabel??r.id,l=this.getPickerDomId(r.id,t),a=String(this._fieldValues.get(l)??""),c=E(r.id,n).map(f=>({value:f.id,label:f.label,selected:f.id===a})),h=d`<vl-form-label for="${l}" label="Kies ${n}" block .annotation="${r.definition??""}"></vl-form-label>`,u=d`<vl-select id="${l}" name="${l}" label="Kies ${n}" placeholder="Selecteer ${n.toLowerCase()}..." .value="${a}" .options="${c}" @vl-input="${this._onControlInput}"></vl-select>`;return d`${h}${u}`})}
    `}getPickerDomId(e,t){return t?`${t}__${e}`:e}renderRootFieldContent(e){var u;if(!this.result||!this.matchesCondition(e))return p;let t=this._service.getChildren(this.result,e),i=p;if(t.length===0&&((u=e.relevantRiepr)!=null&&u.length)){const f=e.relevantRiepr.map(m=>this.result.concepts.get(m)).filter(m=>m!==void 0);if(f.length>0){let m=f.flatMap(v=>this._service.getChildren(this.result,v));if(m.some(v=>v.relevantDataType||v.relevantCodeList||v.relevantUnit||v.isVerplicht!==void 0)&&m.length>0){t=m;const v=Array.from(new Set(m.flatMap(A=>A.relevantRiepr??[]))).map(A=>this.result.concepts.get(A)).filter(A=>A!==void 0);i=this.renderPickersForRefs(v)}}}const s=this.getEmbeddedPickerIds(e);s.length>0&&!i&&(i=d`
        ${s.map(f=>{const m=this.result.concepts.get(f);if(!m)return p;const $=m.prefLabel??f,v=String(this._fieldValues.get(f)??""),A=E(f,$).map(y=>({value:y.id,label:y.label,selected:y.id===v})),g=d`<vl-form-label for="${f}" label="Kies ${$}" block></vl-form-label>`;return d`${g}<vl-select id="${f}" name="${f}" label="Kies ${$}" placeholder="Selecteer ${$.toLowerCase()}..." .value="${v}" .options="${A}" @vl-input="${this._onControlInput}"></vl-select>`})}
      `);const r=t.length>0,n=e.isMeervoudig===!0,l=n?this.repeatCounts.get(e.id)??1:1,a=this.resolveSeeAlsoTargetScheme(e);e.isMultiselect;const c=[];for(let f=0;f<l;f++){const m=n?`#${f+1}`:"";let $=!1;if(s.length>0){for(const g of s)if(this.structuralSelections.get(g)){$=!0;break}}const v=r?i!==p&&!$?d`
              <vl-fieldset>
                <span slot="legend">${e.prefLabel??e.id}${n?` ${f+1}`:""}</span>
                ${i}
                <p class="vl-margin--small" style="font-size:0.875rem;color:var(--vl-color--text-alt,#687483);margin-top:0.5rem;margin-bottom:0;">${this.getFieldGateMessage(e)}</p>
              </vl-fieldset>
            `:d`
              <vl-fieldset>
                <span slot="legend">${e.prefLabel??e.id}${n?` ${f+1}`:""}</span>
                ${i}
                ${t.map(g=>d`<div class="codelijst-group__child">${this.renderFieldControl(g,m,e.id)}</div>`)}
                ${a&&$?d`<p class="seealso-hint">↑ Selecteer een item hierboven om verder te gaan met de gedetailleerde rapportering.</p>`:p}
              </vl-fieldset>
            `:this.renderFieldControl(e,m),A=!r&&a?d`
            ${v}
            ${this.hasValueForConcept(e.id)?d`<p class="seealso-hint">Een waarde is geselecteerd — de volgende stap wordt automatisch geladen.</p>`:p}
          `:v;if(v===p&&!r)return p;if(A!==p){const g=n&&l>1?d`<vl-button secondary @click="${()=>this.removeInstance(e.id)}">Verwijder</vl-button>`:p;c.push(d`<div class="codelijst-group__item">${A}${g}</div>`)}}if(c.length===0)return p;const h=n?d`<vl-button secondary @click="${()=>this.addInstance(e.id)}">+ Nog ${(e.prefLabel??"item").toLowerCase()} toevoegen</vl-button>`:p;return{content:d`${c}${h}`,repeatable:n}}hasValueForConcept(e){const t=this._fieldValues.get(e);return t===void 0||t===""?!1:Array.isArray(t)?t.length>0&&t.some(i=>i!==""):!0}resolveSeeAlsoTargetScheme(e){if(!(!this.result||!e.seeAlso))for(const t of e.seeAlso){const i=this.result.schemes.get(t);if(i)return i.id}}getFieldStructuralRefs(e){var i,s;if(!this.result||!e.relevantRiepr)return[];const t=[];for(const r of e.relevantRiepr){let n=this.result.concepts.get(r);if(!n)for(const[l,a]of this.result.concepts.entries()){const c=((i=l.split("#")[1])==null?void 0:i.split("/").pop())??l.split(":").pop(),h=((s=r.split("#")[1])==null?void 0:s.split("/").pop())??r.split(":").pop();if(c&&h&&c.toLowerCase()===h.toLowerCase()){n=a;break}}n&&Array.isArray(n.type)&&n.type.includes("skos:Concept")?E(n.id,n.prefLabel??n.id).length>0&&t.push(n):E(r,r.split(":").pop()??r).length>0&&t.push({id:r,type:["skos:Concept"],prefLabel:r.split(":").pop()??r})}return t}renderFieldControl(e,t,i){if(!this.result||!this.matchesCondition(e))return p;const s=`${e.id}${t}`,r=e.isVerplicht===!0,n=e.prefLabel??e.id,l=this.getFieldStructuralRefs(e);if(l.length>0&&!e.relevantDataType&&!e.relevantCodeList){const g=e.isMultiselect===!0;let y;if(g){const b=`${s}__multiselect`,C=this._fieldValues.get(b)??[],w=l.flatMap(S=>E(S.id,S.prefLabel??S.id).map(x=>({value:x.id,label:x.label,selected:Array.isArray(C)?C.includes(x.id):!1})));y=d`
          <vl-form-label for="${b}" label="Kies ${n}" block .annotation="${e.definition??""}"></vl-form-label>
          <vl-select-rich id="${b}" name="${b}" label="Kies ${n}" placeholder="Selecteer..." ?required="${r}" .multiple=${!0} .value="${C}" .options="${w}" @vl-input="${this._onStructuralPickerInput}" @vl-change="${this._onStructuralPickerInput}"></vl-select-rich>
        `}else{const b=l[0],C=b.prefLabel??b.id,w=this.getPickerDomId(b.id,i??s),S=String(this._fieldValues.get(w)??""),x=E(b.id,C).map(k=>({value:k.id,label:k.label,selected:k.id===S}));y=d`
          <vl-form-label for="${w}" label="Kies ${n}" block .annotation="${e.definition??b.definition??""}"></vl-form-label>
          <vl-select id="${w}" name="${w}" label="Kies ${n}" placeholder="Selecteer ${n.toLowerCase()}..." ?required="${r}" .value="${S}" .options="${x}" @vl-input="${this._onStructuralPickerInput}"></vl-select>
        `}return y}if(e.relevantCodeList){const g=this._service.getCodeListSchemes(this.result,e),y=String(this._fieldValues.get(s)??""),b=g.flatMap(x=>this._service.getTopConceptsForScheme(this.result,x.id).map(k=>({value:k.id,label:k.prefLabel??k.id,selected:k.id===y}))),C=n+(r?" *":""),w=d`<vl-form-label for="${s}" label="${C}" block .annotation="${e.definition??""}"></vl-form-label>`,S=d`<vl-select id="${s}" name="${s}" label="${C}" placeholder="Selecteer..." ?required="${r}" .value="${y}" .options="${b}" @vl-input="${this._onControlInput}"></vl-select>`;return d`${w}${S}`}const a=e.relevantUnit??[];let c,h,u,f,m=!1;if(a.length>0)for(const g of a){const y=this.result.schemes.get(g);if(y){c=y,m=!0;break}const b=this.result.concepts.get(g);b&&!m&&(h=b,u=g),!h&&!m&&(f=g.split(":").pop()||g,u=g)}if(m&&c){const g=String(this._fieldValues.get(s)??""),y=this._service.getTopConceptsForScheme(this.result,c.id).map(S=>({value:S.id,label:S.prefLabel??S.id,selected:S.id===g})),b=n+(r?" *":""),C=d`<vl-form-label for="${s}" label="${b}" block .annotation="${e.definition??""}"></vl-form-label>`,w=d`<vl-select id="${s}" name="${s}" label="${b}" placeholder="Selecteer eenheid..." ?required="${r}" .value="${g}" .options="${y}" @vl-input="${this._onControlInput}"></vl-select>`;return d`${C}${w}`}if(e.relevantDataType===_.BOOLEAN){const g=n+(r?" *":""),y=d`<vl-form-label for="${s}" label="${g}" block .annotation="${e.definition??""}"></vl-form-label>`;return d`${y}<vl-checkbox id="${s}" name="${s}" ?required="${r}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>`}const $=it(s,s,n,r,e.relevantDataType,this._onControlInput),v=n+(r?" *":""),A=d`<vl-form-label for="${s}" label="${v}" block .annotation="${e.definition??""}"></vl-form-label>`;return this.renderWithUnit(A,$,h,u,f)}renderWithUnit(e,t,i,s,r){let n;if(i)n=i.code??i.prefLabel??i.id;else{if(s){const l=nt(s);l!==void 0&&l!==""&&(n=l)}!n&&r&&(n=r)}return n?d`
      ${e}
      <div class="vl-input-group">
        ${t}
        <span class="vl-input-addon">${n}</span>
      </div>
    `:d`${e}${t}`}addInstance(e){const t=this.repeatCounts.get(e)??1;this.repeatCounts.set(e,t+1),this.requestUpdate()}removeInstance(e){const t=this.repeatCounts.get(e)??1;this.repeatCounts.set(e,Math.max(1,t-1)),this.requestUpdate()}_onControlInput(e){var r;const t=e.currentTarget,i=t.id;let s=(r=e.detail)==null?void 0:r.value;if(s===void 0&&(s="value"in t?t.value:void 0),this._fieldValues.set(i,s),this.result){if(this.result.concepts.has(i))this.structuralSelections.set(i,String(s??""));else for(const[n]of this.result.concepts.entries())if(i.includes(n)){this.structuralSelections.set(n,String(s??""));break}}this.requestUpdate()}_onStructuralPickerInput(e){var t;if(!this._structuralHandlerRunning){this._structuralHandlerRunning=!0;try{const i=e.currentTarget,s=i.id;let r=(t=e.detail)==null?void 0:t.value;r===void 0&&(r="value"in i?i.value:void 0);const n=this._fieldValues.get(s);if(Array.isArray(r)&&Array.isArray(n)?r.length===n.length&&r.every((c,h)=>c===n[h]):r===n)return;this._fieldValues.set(s,r);const a=Array.isArray(r)?r:String(r??"");if(this.result&&this.hasSelection(a)){if(this.result.concepts.has(s))this.structuralSelections.set(s,a);else for(const[c]of this.result.concepts.entries())if(s.includes(c)){this.structuralSelections.set(c,a);break}}this.checkSeeAlsoForPickerDomId(s,r)}finally{this.requestUpdate(),this._structuralHandlerRunning=!1}}}hasSelection(e){return Array.isArray(e)?e.some(t=>t&&t!==""):e!==""}checkSeeAlsoForPickerDomId(e,t){if(!this.result||!(Array.isArray(t)?t.some(r=>r&&r!==""):!!t&&String(t)!==""))return;const s=this.result.concepts.get(e);if(s){const r=this.resolveSeeAlsoTargetScheme(s);if(r){this.dispatchEvent(new CustomEvent("flow-navigate",{bubbles:!0,composed:!0,detail:{schemeId:r,triggerConceptId:s.id}}));return}}for(const[r,n]of this.result.concepts.entries())if(e.includes(r)){const l=this.resolveSeeAlsoTargetScheme(n);if(l){this.dispatchEvent(new CustomEvent("flow-navigate",{bubbles:!0,composed:!0,detail:{schemeId:l,triggerConceptId:n.id}}));return}}}checkSeeAlsoNavigation(e,t){if(!this.result||!(Array.isArray(t)?t.some(n=>n&&n!==""):!!t&&String(t)!==""))return;const s=this.result.concepts.get(e);if(!s)return;const r=this.resolveSeeAlsoTargetScheme(s);r&&this.dispatchEvent(new CustomEvent("flow-navigate",{bubbles:!0,composed:!0,detail:{schemeId:r,triggerConceptId:s.id}}))}anyStructuralSelected(){for(const e of this.structuralSelections.values())if(Array.isArray(e)){if(e.some(t=>t&&t!==""))return!0}else if(e&&e!=="")return!0;return!1}collectAllStructuralConceptIds(e,t){var r,n;const i=this.result,s=new Set;for(const l of this._service.getRelevantRieprRefs(i,e))(r=l.type)!=null&&r.includes("skos:Concept")&&s.add(l.id);for(const l of t){const a=this.getFieldStructuralRefs(l);if(a.length>0)for(const c of a)s.add(c.id);if((n=l.relevantRiepr)!=null&&n.length){const c=l.relevantRiepr.map(h=>i.concepts.get(h)).find(h=>h!==void 0);if(c){const h=this._service.getChildren(i,c);for(const u of h)for(const f of u.relevantRiepr??[]){const m=i.concepts.get(f);m&&(m.type??[]).includes("skos:Concept")&&s.add(f)}}}}return s}getGateInstructionMessage(e,t){var s,r;const i=this.result;for(const n of t){if(n.selecteerEerstMessage&&n.selecteerEerstMessage.trim())return n.selecteerEerstMessage.trim();if((s=n.relevantRiepr)!=null&&s.length)for(const l of n.relevantRiepr){const a=i.concepts.get(l);if(a!=null&&a.definition)return a.definition;if(a!=null&&a.prefLabel)return`Selecteer eerst een ${a.prefLabel.toLowerCase()} om de velden te bekijken.`}}for(const n of this._service.getRelevantRieprRefs(i,e))if((r=n.type)!=null&&r.includes("skos:Concept")){const l=n;if(l.definition)return l.definition;if(l.prefLabel)return`Selecteer eerst een ${l.prefLabel.toLowerCase()}.`}return"Selecteer eerst een type in de bovenstaande lijst."}getFieldGateMessage(e){var i;if((i=e.selecteerEerstMessage)!=null&&i.trim())return e.selecteerEerstMessage.trim();const t=this.result;for(const s of e.relevantRiepr??[]){const r=t.concepts.get(s);if(r!=null&&r.definition)return r.definition;if(r!=null&&r.prefLabel)return`Selecteer eerst een ${r.prefLabel.toLowerCase()} om deze velden te bekijken.`}for(const s of this._service.getChildren(t,e))for(const r of s.relevantRiepr??[]){const n=t.concepts.get(r);if(n!=null&&n.definition)return n.definition;if(n!=null&&n.prefLabel)return`Selecteer eerst een ${n.prefLabel.toLowerCase()}.`}return"Selecteer eerst een type om de velden te bekijken."}getEmbeddedPickerIds(e){var r;const t=this.result,i=[],s=this._service.getChildren(t,e);if(s.length===0&&((r=e.relevantRiepr)!=null&&r.length)){const n=e.relevantRiepr.map(l=>t.concepts.get(l)).find(l=>l!==void 0);if(n){const l=this._service.getChildren(t,n);for(const a of l)for(const c of a.relevantRiepr??[]){const h=t.concepts.get(c);h&&(h.type??[]).includes("skos:Concept")&&E(h.id,h.prefLabel??h.id).length>0&&i.push(h.id)}}}for(const n of s)for(const l of n.relevantRiepr??[]){const a=t.concepts.get(l);a&&(a.type??[]).includes("skos:Concept")&&E(a.id,a.prefLabel??a.id).length>0&&(i.includes(a.id)||i.push(a.id))}return i}expandSchemeRelevantRieprToFields(e){if(!this.result||!e.relevantRiepr)return[];const t=[];for(const i of e.relevantRiepr){let s=this.result.concepts.get(i);if(!s){const r=this.result.schemes.get(i);if(r){const n=r.prefLabel??"Type";t.push({id:`${e.id}:type-picker-${i.split(":").pop()??i}`,type:["skos:Concept"],prefLabel:`Kies ${n.toLowerCase()}`,definition:r.definition,relevantCodeList:[i]});continue}}if(s&&Array.isArray(s.type)&&s.type.includes("skos:Concept")){const r=this._service.getChildren(this.result,s);t.push({id:`${e.id}:${s.id.split(":").pop()??s.id}`,type:["skos:Concept"],prefLabel:s.prefLabel??s.id,definition:s.definition,relevantRiepr:[s.id],narrower:r.length>0?r.map(n=>n.id):void 0})}}return t}_onCheckboxChange(e){var r;const t=e.currentTarget,i=t.id,s=((r=e.detail)==null?void 0:r.checked)??t.checked;if(this._fieldValues.set(i,String(s).toLowerCase()),this.result){for(const[n]of this.result.concepts.entries())if(i===n||i.startsWith(n+"#")){this._fieldValues.set(n,String(s).toLowerCase());break}}this.requestUpdate()}matchesCondition(e){if(!e.conditionPath||!e.conditionValue)return!0;const t=e.conditionPath;if(typeof e.conditionValue=="number"&&Number.isNaN(e.conditionValue)){let n=this._fieldValues.get(t);if(n===void 0||n===""||Array.isArray(n)&&n.length===0)return!0;const l=t.replace(/#\d+$/,"");let a=!1;for(const[c,h]of this._fieldValues.entries())if(c.startsWith(l)&&h!==void 0&&h!==""){a=!0;break}return!a}const i=String(e.conditionValue).toLowerCase().trim();let s=this._fieldValues.get(t);if(s!==void 0&&this.valueMatchesExpected(String(s),i))return!0;const r=t.replace(/#\d+$/,"");for(const[n,l]of this._fieldValues.entries())if(n.startsWith(r)&&this.valueMatchesExpected(String(l),i))return!0;return!1}valueMatchesExpected(e,t){const i=e.toLowerCase().trim();return!!(i===t||i.endsWith(`:${t}`)||i.endsWith(`#${t}`)||i.includes(":")&&i.split(":").pop().toLowerCase()===t)}};Z.styles=[G`
      :host {
        display: block;
      }

      /* ---- Group card styling (root-field wrappers) ---- */
      .codelijst-group {
        margin-bottom: 1.5rem;
        padding: 1.5rem;
        border: 1px solid #e0e0e0;
        border-radius: 0.3rem;
        background: var(--vl-color--white, #fff);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .codelijst-repeatable-group {
        border-style: dashed;
        background: #f9fafb;
      }

      /* Spacing between control rows inside composite groups (fieldsets) */
      .codelijst-group__child {
        margin-bottom: 0.75rem;
      }
      .codelijst-group__child:last-child {
        margin-bottom: 0;
      }

      /* Ensure the last item in a group doesn't add extra space at bottom */
      .codelijst-group > *:last-child {
        margin-bottom: 0;
      }

      /* ---- Unit addon next to input fields ---- */
      .vl-input-group {
        display: flex;
        align-items: stretch;
      }
      .vl-input-addon {
        display: inline-flex;
        align-items: center;
        padding: 0.375rem 0.75rem;
        background: var(--vl-color--grey-100, #f7f9fc);
        border: 1px solid var(--vl-color--border, #cbd2da);
        border-radius: var(--vl-border--radius, 0.3rem);
        font-size: 0.875rem;
        color: var(--vl-color--text-alt, #687483);
        min-width: 48px;
        justify-content: center;
        user-select: none;
      }

      /* ---- SeeAlso navigation hint ---- */
      .seealso-hint {
        font-size: 0.8125rem;
        color: var(--vl-color--text-alt, #687483);
        margin-top: 0.25rem;
        font-style: italic;
      }

      /* Spacing between input controls and the verwijder button in meervoudige groups */
      .codelijst-group__item > vl-button {
        margin-top: var(--vl-spacing--small, 0.5rem);
      }
    `,he],Z.properties={result:{attribute:!1},schemeId:{attribute:!1},codelistService:{attribute:!1}};let oe=Z;customElements.define("codelijst-operationeel-fields",oe);const ue=class ue extends M{constructor(){super(...arguments),this.codelistService=new pe,this.flowStack=[]}firstUpdated(){this.loadCodelist()}async loadCodelist(){try{this.result=await this.codelistService.loadCodelist()}catch(e){this.loadError=e instanceof Error?e.message:String(e),console.error("Kon codelijst niet laden:",e)}this.requestUpdate()}onYearSelect(e){const t=Number(e.detail.value);!Number.isNaN(t)&&t>0?this.selectedYear=t:this.selectedYear=void 0,this.requestUpdate()}onThemeSelect(e){this.selectedThemeId=e.detail.themeId,this.selectedSubThemeId=e.detail.subThemeId,this.flowStack=[],this.resolveBaseScheme(),this.requestUpdate()}resolveBaseScheme(){if(!this.result)return;const e=this.result.concepts.get(this.selectedSubThemeId??this.selectedThemeId??"");if(!e)return;const t=this.codelistService.resolveOperationeelSchemeId(this.result,e);t?this.flowStack=[{schemeId:t}]:this.flowStack=[]}onFlowNavigate(e){this.flowStack.push({schemeId:e.detail.schemeId,triggerConceptId:e.detail.triggerConceptId}),this.requestUpdate()}goToBase(){this.flowStack.length>1&&(this.flowStack=[this.flowStack[0]],this.requestUpdate())}get currentSchemeId(){var e;return(e=this.flowStack[this.flowStack.length-1])==null?void 0:e.schemeId}render(){return d`
      <div class="vl-page">
        <main class="vl-main-content">
          <div class="vl-region">
            <div class="vl-layout">
              <h1>RIE-IEPR Codelijst POC</h1>

              ${this.loadError?d`<vl-alert type="error" title="Kon codelijst niet laden" message="${this.loadError}"></vl-alert>`:this.result?d`
                       <vl-form-label for="productie-jaar" label="Productie jaar" block></vl-form-label>
                       <vl-select
                         id="productie-jaar"
                         name="productie-jaar"
                         placeholder="Selecteer een productie jaar..."
                         .options="${this.getProductieJaarOptions()}"
                         .value="${String(this.selectedYear??"")}"
                         @vl-input="${this.onYearSelect}"
                       ></vl-select>

                       ${this.selectedYear?d`
                             <p class="vl-margin--small">Selecteer een thema voor ${this.selectedYear} om de bijbehorende operationele velden te bekijken.</p>

                             <codelijst-theme-selector
                               .result="${this.result}"
                               .selectedThemeId="${this.selectedThemeId}"
                               .selectedSubThemeId="${this.selectedSubThemeId}"
                               .codelistService="${this.codelistService}"
                               @theme-select="${this.onThemeSelect}"
                             ></codelijst-theme-selector>

                  ${this.currentSchemeId?d`${this.renderAllFlowSteps()}`:this.selectedThemeId?d`<p>Voor dit thema zijn geen operationele gegevens gedefinieerd.</p>`:p}
                             `:p}
                  `:d`<p>Codelijsten laden...</p>`}
            </div>
          </div>
        </main>
      </div>
    `}getProductieJaarOptions(){const e=new Date().getFullYear(),t=[];for(let i=e-5;i<=e+2;i++)t.push({value:String(i),label:String(i)});return t}renderAllFlowSteps(){return d`
      ${this.flowStack.map((e,t)=>{var r;const i=(r=this.result)==null?void 0:r.schemes.get(e.schemeId),s=t===this.flowStack.length-1;return d`
          <div class="vl-fieldset-wrapper">
            <vl-fieldset>
              <span slot="legend">${(i==null?void 0:i.prefLabel)??"Operationele gegevens"}</span>
              <codelijst-operationeel-fields
                style="margin-top: var(--vl-spacing--xsmall, 0.5rem)"
                .result="${this.result}"
                .schemeId="${e.schemeId}"
                .codelistService="${this.codelistService}"
                ?data-is-last="${s}"
                @flow-navigate="${s?this.onFlowNavigate:p}"
              ></codelijst-operationeel-fields>
            </vl-fieldset>
          </div>
          ${s&&this.flowStack.length>1?d`
                <div style="margin-top: var(--vl-spacing--small);">
                  <vl-button secondary @click="${this.goToBase}">← Terug naar overzicht</vl-button>
                </div>
              `:p}
        `})}
    `}};ue.styles=[G`
      :host {
        display: block;
      }

      /* ---- Fieldset wrapper for operationele gegevens section ---- */
      .vl-fieldset-wrapper {
        margin-top: var(--vl-spacing--medium);
        margin-bottom: var(--vl-spacing--large);
      }
    `,he,Qe];let le=ue;customElements.define("codelijst-app",le);
//# sourceMappingURL=index-CVdOF0c4.js.map
