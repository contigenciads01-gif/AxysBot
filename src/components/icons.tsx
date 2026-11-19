// Icones inline (sem biblioteca: nada de barrel import pesado no bundle).
type P = { size?: number; className?: string };
const base = (size = 18) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const IconPainel = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></svg>);
export const IconAgenda = ({ size, className }: P) => (<svg {...base(size)} className={className}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>);
export const IconEscrever = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>);
export const IconInbox = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M4 13l2.5-7.5h11L20 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20" /></svg>);
export const IconAjustes = ({ size, className }: P) => (<svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
export const IconPlay = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" /></svg>);
export const IconPause = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M8 5v14M16 5v14" strokeWidth={3} /></svg>);
export const IconSync = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4" /></svg>);
export const IconSpark = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>);
export const IconCheck = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const IconX = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconLink = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></svg>);
export const IconRede = ({ size, className }: P) => (<svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>);
export const IconExterno = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></svg>);
export const IconRepost = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M7 7h10a3 3 0 0 1 3 3v2M17 17H7a3 3 0 0 1-3-3v-2M17 4l3 3-3 3M7 20l-3-3 3-3" /></svg>);
export const IconResposta = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /></svg>);
export const IconBusca = ({ size, className }: P) => (<svg {...base(size)} className={className}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>);
export const IconBot = ({ size, className }: P) => (<svg {...base(size)} className={className}><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4M8 15h.01M16 15h.01M9 19h6" /></svg>);
export const IconFogo = ({ size, className }: P) => (<svg {...base(size)} className={className}><path d="M12 2c1 3 4 5.5 4 9a6 6 0 1 1-12 0c0-4 3.5-7 4-9 1 2 2 3 4 0z" /></svg>);

