/* ===========================================
   PORENNA v1
=========================================== */

gsap.registerPlugin(ScrollTrigger);

/* HERO */

gsap.from(".hero-content",{

    opacity:0,

    y:40,

    duration:1.2,

    ease:"power3.out"

});

gsap.from(".scroll-indicator",{

    opacity:0,

    delay:.6,

    duration:1,

    ease:"power2.out"

});

/* PLATE */

gsap.set(".plate-wrapper",{

    scale:.82,

    y:220

});

gsap.to(".plate-wrapper",{

    y:0,

    scale:1,

    ease:"none",

    scrollTrigger:{

        trigger:".plate-section",

        start:"top bottom",

        end:"center center",

        scrub:1.2

    }

});

/* PNG TRANSITIONS */

const plates=[

".plate01",

".plate02",

".plate03",

".plate04"

];

plates.forEach((plate,index)=>{

    if(index===0)return;

    gsap.set(plate,{opacity:0});

});

gsap.to(".plate02",{

    opacity:1,

    scrollTrigger:{

        trigger:".plate-section",

        start:"20% center",

        end:"35% center",

        scrub:true

    }

});

gsap.to(".plate03",{

    opacity:1,

    scrollTrigger:{

        trigger:".plate-section",

        start:"40% center",

        end:"55% center",

        scrub:true

    }

});

gsap.to(".plate04",{

    opacity:1,

    scrollTrigger:{

        trigger:".plate-section",

        start:"60% center",

        end:"75% center",

        scrub:true

    }

});