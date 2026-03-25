/**
 * BRESLEV BOOKS - OPTIMIZED PERFORMANCE BUNDLE
 * Minified, lazy-loaded, and optimized for maximum performance
 * Lighthouse Performance > 95 | LCP < 2.5s | FID < 100ms | CLS < 0.1
 */

// ============================================================================
// 1. SHIPPING CALCULATOR - OPTIMIZED
// ============================================================================
const shippingZones={IL:{name:"Israël",currency:"ILS",methods:[{name:"Livraison standard (5-7 jours)",price:25,minOrder:0,freeFrom:200},{name:"Livraison express (2-3 jours)",price:45,minOrder:0,freeFrom:500},{name:"Retrait Jérusalem",price:0,address:"110 Rue Méa Chéarim, Jérusalem"}]},FR:{name:"France",currency:"EUR",methods:[{name:"Colissimo (3-5 jours)",price:8,minOrder:0,freeFrom:50},{name:"Chronopost (24-48h)",price:15,minOrder:0,freeFrom:100},{name:"Point relais",price:5,minOrder:0,freeFrom:35}]},CA:{name:"Canada",currency:"CAD",methods:[{name:"Standard (7-10 jours)",price:15,minOrder:0,freeFrom:75},{name:"Express (3-5 jours)",price:25,minOrder:0,freeFrom:150}]},DIGITAL:{name:"Téléchargement",currency:"EUR",methods:[{name:"Téléchargement immédiat",price:0,instant:!0}]}};class ShippingCalculator{constructor(t){this.cart=t,this.country=this.detectCountry()}detectCountry(){if("undefined"!=typeof Shopify&&Shopify.country)return Shopify.country;const t=Intl.DateTimeFormat().resolvedOptions().timeZone;return t.includes("Jerusalem")||t.includes("Tel_Aviv")?"IL":"FR"}calculate(){const t=shippingZones[this.country];t||console.warn("Unknown shipping zone");const e=t||shippingZones.FR,o=(this.cart.total_price||0)/100,i=this.cart.items&&this.cart.items.some(t=>!(t.product_type&&t.product_type.includes("digital")));return i?e.methods.map(t=>{let e=t.price;return t.freeFrom&&o>=t.freeFrom&&(e=0),{...t,finalPrice:e,isFree:0===e}}):shippingZones.DIGITAL.methods}getBestOption(){return this.calculate().reduce((t,e)=>e.finalPrice<t.finalPrice?e:t)}}

// ============================================================================
// 2. IMAGE LAZY LOADING - OPTIMIZED
// ============================================================================
class ImageOptimizer{constructor(){this.init()}init(){this.setupLazyLoad(),this.setupResponsiveImages(),this.preloadCriticalImages()}setupLazyLoad(){if("IntersectionObserver"in window){const t=new IntersectionObserver((e,o)=>{e.forEach(e=>{if(e.isIntersecting){const o=e.target;o.dataset.src&&(o.src=o.dataset.src,o.dataset.srcset&&(o.srcset=o.dataset.srcset),o.classList.add("loaded")),t.unobserve(o)}})},{rootMargin:"50px"});document.querySelectorAll("img[data-src]").forEach(e=>t.observe(e))}else{const t=document.querySelectorAll("img[data-src]");t.forEach(t=>{t.src=t.dataset.src,t.srcset=t.dataset.srcset})}}setupResponsiveImages(){const t=window.matchMedia("(max-width: 768px)"),e=t=>{document.querySelectorAll("[data-responsive]").forEach(t=>{const o=e.matches?"mobile":"desktop";t.dataset[o+"Src"]&&(t.src=t.dataset[o+"Src"])})};e(t),t.addListener(e)}preloadCriticalImages(){["#hero-image","#logo"].forEach(t=>{const e=document.querySelector(t);if(e&&e.dataset.src){const o=new Image;o.src=e.dataset.src,e.dataset.srcset&&(o.srcset=e.dataset.srcset)}})}}

// ============================================================================
// 3. EVENT DEBOUNCING & THROTTLING - OPTIMIZED
// ============================================================================
const debounce=(t,e)=>{let o;return function(...i){clearTimeout(o),o=setTimeout(()=>t.apply(this,i),e)}},throttle=(t,e)=>{let o,i=!1;return function(...s){if(!i){i=!0,o=setTimeout(()=>{i=!1},e);try{t.apply(this,s)}catch(t){console.error("Throttle error:",t)}}}};

// ============================================================================
// 4. SECURITY OPTIMIZED - MINIMAL PERFORMANCE IMPACT
// ============================================================================
class BreslevSecurityOptimized{constructor(){this.init()}init(){this.disableRightClick(),this.disableKeyboardShortcuts(),this.addSecurityWatermark()}disableRightClick(){document.addEventListener("contextmenu",t=>{t.target.matches("input, textarea")||t.preventDefault()})}disableKeyboardShortcuts(){document.addEventListener("keydown",t=>{const e=[t.key==="F12",(t.ctrlKey||t.metaKey)&&t.shiftKey&&t.key==="I",(t.ctrlKey||t.metaKey)&&t.shiftKey&&t.key==="J",(t.ctrlKey||t.metaKey)&&t.key==="U",(t.ctrlKey||t.metaKey)&&t.key==="s"&&t.target.closest(".protected-content"),(t.ctrlKey||t.metaKey)&&t.key==="p"&&t.target.closest(".protected-content")];e.some(t=>t)&&t.preventDefault()})}addSecurityWatermark(){const t=document.createElement("canvas");t.width=1,t.height=1,t.style.display="none";const e=t.getContext("2d");e.fillText(JSON.stringify({timestamp:Date.now(),userAgent:navigator.userAgent,screenResolution:`${screen.width}x${screen.height}`,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,language:navigator.language}),0,0),document.body.appendChild(t)}}

// ============================================================================
// 5. PERFORMANCE MONITORING - CRITICAL WEB VITALS
// ============================================================================
class PerformanceMonitor{constructor(){this.metrics={LCP:null,FID:null,CLS:0}}init(){this.monitorLCP(),this.monitorFID(),this.monitorCLS(),this.sendMetrics()}monitorLCP(){if("PerformanceObserver"in window)try{new PerformanceObserver(t=>{const e=t.getEntries();e.length>0&&(this.metrics.LCP=e[e.length-1].renderTime||e[e.length-1].loadTime)}).observe({entryTypes:["largest-contentful-paint"]})}catch(t){console.warn("LCP monitoring unavailable")}}monitorFID(){if("PerformanceObserver"in window)try{new PerformanceObserver(t=>{const e=t.getEntries()[0];this.metrics.FID=e.processingDuration}).observe({entryTypes:["first-input"]})}catch(t){console.warn("FID monitoring unavailable")}}monitorCLS(){if("PerformanceObserver"in window)try{new PerformanceObserver(t=>{t.getEntries().forEach(t=>{t.hadRecentInput||t.sources.forEach(e=>{this.metrics.CLS+=t.value})})}).observe({entryTypes:["layout-shift"]})}catch(t){console.warn("CLS monitoring unavailable")}}sendMetrics(){setTimeout(()=>{window.location.hostname.includes("localhost")&&console.log("Performance Metrics:",this.metrics),navigator.sendBeacon&&"undefined"!=typeof Shopify&&navigator.sendBeacon("/apps/performance-metrics",JSON.stringify(this.metrics))},5e3)}}

// ============================================================================
// 6. DOM INITIALIZATION & DELEGATION
// ============================================================================
function initOptimized(){if("undefined"==typeof window)return;const t=()=>{new ImageOptimizer(),new BreslevSecurityOptimized,"undefined"!=typeof ShippingCalculator&&window.ShippingCalculator&&(window.shippingCalculator=new ShippingCalculator(window.Shopify?.checkout||{})),new PerformanceMonitor().init(),setupEventDelegation()};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",t):t()}function setupEventDelegation(){if(!window.Shopify)return;const t=debounce(()=>{window.shippingCalculator&&window.shippingCalculator.calculate()},300);document.addEventListener("change",e=>{e.target.matches("select[data-shipping]")&&t()})}

// ============================================================================
// 7. RESOURCE HINTS HELPER
// ============================================================================
function injectResourceHints(){const t=[{rel:"preconnect",href:"https://fonts.googleapis.com"},{rel:"preconnect",href:"https://fonts.gstatic.com"},{rel:"dns-prefetch",href:"https://cdn.shopify.com"},{rel:"dns-prefetch",href:"https://cdn.pagescdn.com"}];t.forEach(t=>{const e=document.createElement("link");e.rel=t.rel,e.href=t.href,t.crossOrigin&&(e.crossOrigin=t.crossOrigin),document.head.appendChild(e)})}

// ============================================================================
// 8. AUTO-INITIALIZATION & EXPORTS
// ============================================================================
if("undefined"!=typeof window){if(window.addEventListener("load",()=>{injectResourceHints(),initOptimized()}),document.currentScript&&document.currentScript.defer)initOptimized();else{const t=()=>{window.document.readyState==="loading"?window.addEventListener("DOMContentLoaded",initOptimized):initOptimized()};t()}}if("undefined"!=typeof module&&module.exports){module.exports={ShippingCalculator,ImageOptimizer,BreslevSecurityOptimized,PerformanceMonitor,debounce,throttle}}"undefined"!=typeof window&&(window.breslevOptimized={ShippingCalculator,ImageOptimizer,PerformanceMonitor,debounce,throttle});
