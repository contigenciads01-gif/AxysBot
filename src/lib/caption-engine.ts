export interface ScenarioProfile {
  id: "water" | "gym" | "mirror" | "street" | "close";
  label: string;
  icon: string;
  scenario: string;
  outfit: string;
  pose: string;
  mood: string;
  tags: string[];
  getCaptions: (daySlang: DaySlang) => string[];
}

export interface DaySlang {
  greeting: string;
  dayName: string;
  short: string;
}

export function getDaySlang(dateInput?: string | Date): DaySlang {
  const d = dateInput ? new Date(dateInput) : new Date();
  const day = d.getDay(); // 0 = Dom, 1 = Seg, ..., 5 = Sex, 6 = Sáb
  switch (day) {
    case 0:
      return { greeting: "Domingou", dayName: "domingo", short: "domingo" };
    case 1:
      return { greeting: "Segundou", dayName: "segunda-feira", short: "segunda" };
    case 2:
      return { greeting: "Terçou", dayName: "terça-feira", short: "terça" };
    case 3:
      return { greeting: "Quartou", dayName: "quarta-feira", short: "quarta" };
    case 4:
      return { greeting: "Quintou", dayName: "quinta-feira", short: "quinta" };
    case 5:
      return { greeting: "Sextou", dayName: "sexta-feira", short: "sexta" };
    case 6:
      return { greeting: "Sabadou", dayName: "sábado", short: "sábado" };
    default:
      return { greeting: "Hoje", dayName: "hoje", short: "hoje" };
  }
}

export const SCENARIO_CATALOG: Record<string, ScenarioProfile> = {
  water: {
    id: "water",
    label: "Água & Pôr do Sol",
    icon: "🌊",
    scenario: "Água / Lago ao pôr do sol com reflexo dourado",
    outfit: "Blusa leve / biquíni com a mão no cabelo",
    pose: "Mão no cabelo se refrescando na água",
    mood: "Refrescante, picante, sensual e solar",
    tags: ["#sunset", "#beachvibes", "#verao", "#pordosol", "#danadinha", "#marquinha", "#vip", "#sexy"],
    getCaptions: () => [
      "Nada como um pôr do sol para refrescar essa xana né? ☀️🌊 Mão no cabelo e aquela água quentinha batendo no corpo... Nada melhor que um fim de tarde desses! 🔥",
      "Dourada pelo sol e essa água refrescando tudo... Mão no cabelo e aquele calor gostoso no corpo, nada como se refrescar no fim de tarde 💦☀️🔥",
      "Água quentinha no pôr do sol pra refrescar a danadinha ☀️🌊 O que você mais gosta de fazer num fim de tarde quente assim? Me conta no direct 👀🔥",
      "Com a mão no cabelo e sentindo a água refrescar tudo... Esse pôr do sol merecia uma companhia pra me esquentar depois né? 🌊😈🔥",
    ],
  },
  gym: {
    id: "gym",
    label: "Academia & Treino",
    icon: "💪",
    scenario: "Academia moderna valorizando treino de perna e glúteo",
    outfit: "Top fitness decotado e shortinho coladinho",
    pose: "Pós-treino suada valorizando curvas e bumbum empinado",
    mood: "Gostosa, sarada, focada e cansada 😮‍💨",
    tags: ["#gym", "#treino", "#fitness", "#suor", "#shape", "#bumbumnanuca", "#danadinha", "#foco", "#gymgirl"],
    getCaptions: (daySlang) => [
      `${daySlang.greeting} 🔥 Hoje a danadinha suou na academia 😮‍💨 Treino de perna pago e o shortinho coladinho quase não aguenta! Quem aí curte mulher focada? 💪🔥`,
      `${daySlang.greeting} pago! Confesso que hoje a danadinha suou horrores no treino de glúteo 😮‍💨🍑 As curvas agradecem né? Comenta um 🔥!`,
      `${daySlang.greeting} com shape alinhado! A danadinha suou até a última gota 😮‍💨💪 Treino pesado, bumbum na nuca e aquela endorfina gostosa... Quem não pula treino comenta aqui!`,
      `Treino de ${daySlang.dayName} concluído com sucesso! Hoje a danadinha suou de verdade 😮‍💨🔥 O suor escorrendo e a energia lá em cima... Quer ver o pós-treino no VIP?`,
    ],
  },
  mirror: {
    id: "mirror",
    label: "Quarto & Espelho",
    icon: "🪞",
    scenario: "Quarto intimista com iluminação quente e espelho de corpo inteiro",
    outfit: "Lingerie rendada / calcinha pequenininha com transparência",
    pose: "Selfie no espelho em ângulo lateral destacando quadril e decote",
    mood: "Altamente provocante, misteriosa e safada 😈",
    tags: ["#bastidores", "#espelho", "#lingerie", "#provador", "#danadinha", "#sensual", "#vip", "#direct"],
    getCaptions: () => [
      "No espelho do quarto conferindo se essa calcinha tá pequenininha o suficiente... A danadinha pronta pra dormir, quem aí vem me dar boa noite? 😈🖤",
      "Aquele spoiler rápido no espelho do provador... O que você faria se recebesse essa foto na sua DM agora sem aviso? 👀🔥",
      "Olhei no espelho e tive que registrar esse decote e essa transparência... Detalhes que quase ninguém vê de perto 🖤 O resto sem corte tá na bio 😈",
      "Meia-luz no quarto e essa vibe misteriosa... A danadinha adora provocar quem fica até tarde acordado 👀 Me conta o que você faria aqui agora 🔥",
    ],
  },
  street: {
    id: "street",
    label: "Muro & Grafite",
    icon: "🎨",
    scenario: "Rua com muro grafitado e estética urbana colorida",
    outfit: "Shortinho jeans coladinho e cropped decotado",
    pose: "Em pé descontraída encostada no muro destacando curvas e cintura",
    mood: "Estilosa, urbana, jovem e provocante",
    tags: ["#streetstyle", "#lookdodia", "#grafite", "#rua", "#danadinha", "#estilo", "#curvas", "#vip"],
    getCaptions: () => [
      "Rolê na rua com esse shortinho colado e o olhar que não nega nada... Quem me visse passando nesse muro de grafite tinha coragem de puxar assunto? 🔥👀",
      "Passando pra colorir sua timeline nessa vibe urbana... O lookinho básico que desenha cada curva na rua 😉🔥",
      "A danadinha solta pela cidade... O dia tá lindo mas essa vista aqui na calçada tá bem melhor né? 🔥🖤",
      "Parando o trânsito com esse cropped colado... Quem me encontra na rua perde o rumo 😉 Comenta se você aprova o visual!",
    ],
  },
  close: {
    id: "close",
    label: "Decote & Olhar Fatal",
    icon: "🔥",
    scenario: "Close-up intimista com foco no decote, rosto e olhar sedutor",
    outfit: "Blusa justa com decote profundo e colar delicado",
    pose: "Olhar fatal penetrante com lábios entreabertos e sorriso misterioso",
    mood: "Sensual, hipnótica, instigante e irresistível",
    tags: ["#close", "#decote", "#olharfatal", "#danadinha", "#sedutora", "#vip", "#direct", "#sexy"],
    getCaptions: () => [
      "Esse decote hoje quase não aguentou... Aquele olhar doce com uma intenção que vocês já conhecem bem 😈🔥 De 0 a 10, quanto desconcentrou? 👀",
      "Um close bem de pertinho pra ver cada detalhe... Essa boquinha e esse olhar sedutor pra alegrar seu dia 😈 Me chama no direct!",
      "Aquele momento em que o decote fala mais alto que qualquer palavra... Quer ver os bastidores completos desse clique? Link na bio 🔥",
      "Aquele olhar que diz mais do que mil mensagens... O que você me falaria no direct se me encontrasse hoje? 👀🔥",
    ],
  },
};

/**
 * Classifica a mídia com base em pistas de texto, palavras-chave e rotação equilibrada
 */
export function classifyMediaScenario(
  searchString: string,
  fallbackIndex = 0
): ScenarioProfile {
  const s = (searchString || "").toLowerCase();

  // 1. Água / Lago / Pôr do Sol / Sol / Praia
  if (
    s.includes("agua") ||
    s.includes("água") ||
    s.includes("water") ||
    s.includes("lake") ||
    s.includes("lago") ||
    s.includes("rio") ||
    s.includes("sunset") ||
    s.includes("pôr do sol") ||
    s.includes("por do sol") ||
    s.includes("sol") ||
    s.includes("sun") ||
    s.includes("praia") ||
    s.includes("beach") ||
    s.includes("mar") ||
    s.includes("cabelo") ||
    s.includes("refrescar")
  ) {
    return SCENARIO_CATALOG.water;
  }

  // 2. Academia / Treino / Suor / Fitness
  if (
    s.includes("gym") ||
    s.includes("treino") ||
    s.includes("academia") ||
    s.includes("fitness") ||
    s.includes("suor") ||
    s.includes("suou") ||
    s.includes("workout") ||
    s.includes("shape") ||
    s.includes("shortinho") ||
    s.includes("gluteo") ||
    s.includes("glúteo") ||
    s.includes("perna")
  ) {
    return SCENARIO_CATALOG.gym;
  }

  // 3. Quarto / Espelho / Lingerie / Provador
  if (
    s.includes("espelho") ||
    s.includes("mirror") ||
    s.includes("quarto") ||
    s.includes("cama") ||
    s.includes("lingerie") ||
    s.includes("provador") ||
    s.includes("calcinha") ||
    s.includes("intima") ||
    s.includes("íntima") ||
    s.includes("selfie") ||
    s.includes("transparencia") ||
    s.includes("transparência")
  ) {
    return SCENARIO_CATALOG.mirror;
  }

  // 4. Muro / Grafite / Street
  if (
    s.includes("grafite") ||
    s.includes("graffiti") ||
    s.includes("muro") ||
    s.includes("wall") ||
    s.includes("street") ||
    s.includes("rua") ||
    s.includes("urbano")
  ) {
    return SCENARIO_CATALOG.street;
  }

  // 5. Close / Decote / Fatal
  if (
    s.includes("close") ||
    s.includes("decote") ||
    s.includes("rosto") ||
    s.includes("olhar") ||
    s.includes("fatal") ||
    s.includes("boca") ||
    s.includes("face")
  ) {
    return SCENARIO_CATALOG.close;
  }

  // Rotação autêntica para lote da July quando os nomes são genéricos (ex: Generate_photorealistic...)
  const rotationOrder: Array<keyof typeof SCENARIO_CATALOG> = [
    "street", // Foto 1 no grafite
    "mirror", // Foto 2 no espelho
    "water",  // Foto 3 na água com pôr do sol
    "gym",    // Foto 4 na academia
    "close",  // Foto 5 no close fatal
    "mirror", // Foto 6 lingerie intimista
  ];

  const chosenKey = rotationOrder[fallbackIndex % rotationOrder.length] || "water";
  return SCENARIO_CATALOG[chosenKey];
}
