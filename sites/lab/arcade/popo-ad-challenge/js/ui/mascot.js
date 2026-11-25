/** POPO 吉祥物（来自品牌图标），眼睛单独分组用于眨眼动画 */
let seq = 0;

export function mascotSvg(cls = '') {
  seq += 1;
  const g = `pm-g${seq}`;
  const f = `pm-f${seq}`;
  return `
<svg class="${cls}" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g filter="url(#${f})">
    <path d="M6.71161 2.593C5.5329 3.03147 4.55689 4.12321 3.79082 5.53844C1.54388 9.68943 1.02618 15.6105 4.50402 19.3056C6.69068 21.6289 9.81721 22.9005 13.0266 22.9005C17.5417 22.9005 21.9742 20.2773 23.4384 16.0191C24.3057 13.4969 24.1328 10.6482 23.5901 8.09613C23.3075 6.76725 22.8032 5.61022 21.7897 5.1207C20.7174 4.60288 19.3683 5.00653 18.2627 5.20943C15.7783 3.63943 12.8815 3.01539 10.0057 3.78703C9.17485 2.91992 7.95677 2.12992 6.71161 2.593Z" fill="url(#${g})"/>
  </g>
  <g class="eyes">
    <path d="M13.844 8.34761C15.3045 8.67997 16.219 10.1334 15.8867 11.5939C15.5543 13.0544 14.1009 13.9689 12.6404 13.6365C12.2275 13.5426 11.8582 13.359 11.5484 13.1109C11.082 12.7374 10.3824 12.5782 9.8003 12.7132C9.41371 12.8028 9.00139 12.8085 8.58845 12.7146C7.12796 12.3822 6.21338 10.9288 6.54574 9.46826C6.8781 8.00778 8.33152 7.09327 9.79201 7.42562C10.2049 7.51959 10.5742 7.70318 10.8839 7.9512C11.3504 8.32469 12.0499 8.48387 12.632 8.34897C13.0187 8.25939 13.431 8.25364 13.844 8.34761Z" fill="white"/>
    <circle class="pupil" cx="8.29" cy="9.84" r="1.065" fill="#0A0F02"/>
    <circle class="pupil" cx="12.78" cy="10.85" r="1.065" fill="#0A0F02"/>
  </g>
  <defs>
    <filter id="${f}" x="-5.7" y="-3.1" width="31.4" height="27.7" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="bg"/>
      <feBlend in="SourceGraphic" in2="bg" result="shape"/>
      <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="a1"/>
      <feOffset dx="-7.68" dy="-5.54"/><feGaussianBlur stdDeviation="5.59"/>
      <feComposite in2="a1" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix values="0 0 0 0 0.7055 0 0 0 0 1 0 0 0 0 0.1587 0 0 0 1 0"/>
      <feBlend in2="shape" result="s1"/>
      <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="a2"/>
      <feOffset dx="1.71" dy="1.71"/><feGaussianBlur stdDeviation="3.5"/>
      <feComposite in2="a2" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
      <feBlend in2="s1"/>
    </filter>
    <radialGradient id="${g}" cx="0" cy="0" r="1" gradientTransform="matrix(4.52751 15.3879 -14.1184 4.20193 11.1424 4.83792)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E8FFC9"/><stop offset="0.9276" stop-color="#00B63D"/>
    </radialGradient>
  </defs>
</svg>`;
}
