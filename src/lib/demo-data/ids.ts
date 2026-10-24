// ═══════════════════════════════════════════════════════════════════════
// Centralized ID constants for all demo data entities
// ═══════════════════════════════════════════════════════════════════════

// ─── Accounts ────────────────────────────────────────────────────────
export const ACC = {
  // Hero
  eastchina_platform: "acc_eastchina_platform_001",
  // Case A
  national_bank: "acc_national_bank_003",
  // Case B
  chinamobile: "acc_chinamobile_002",
  // Supporting
  byd: "acc_byd_007",
  stategrid: "acc_stategrid_006",
  fawvw: "acc_fawvw_008",
  countrygarden: "acc_countrygarden_009",
  pingan: "acc_pingan_010",
  ctelecom: "acc_ctelecom_011",
  midea: "acc_midea_012",
  vanke: "acc_vanke_013",
  bytedance: "acc_bytedance_014",
} as const;

// ─── Contacts ────────────────────────────────────────────────────────
export const CON = {
  // Hero: 华东某头部互联网平台 (7)
  wang_jianguo: "con_wang_jianguo_001",   // 李总 — decision_maker
  zhang_li: "con_zhang_li_002",           // 周总 — procurement
  liu_wei: "con_liu_wei_003",             // 王磊 — technical_evaluator
  jiang_xuefeng: "con_jiang_xuefeng_031", // 陈涛 — technical_evaluator
  lv_minhua: "con_lv_minhua_032",         // 张敏 — procurement
  dai_hongyuan: "con_dai_hongyuan_026",   // 何总 — decision_maker (CTO)
  cheng_ruian: "con_cheng_ruian_027",     // 程经理 — champion

  // Case A: 某全国性股份制银行 (3)
  li_ming: "con_li_ming_007",             // 刘总 — decision_maker
  wang_hui: "con_wang_hui_008",           // 孙宁 — champion
  zhou_jian: "con_zhou_jian_025",         // 周总 — technical_evaluator (blocker)

  // Case B: 某全国性通信运营商 (3)
  chen_dawei: "con_chen_dawei_004",       // 赵总 — decision_maker
  zhao_fang: "con_zhao_fang_005",         // 李敏 — procurement
  sun_qiang: "con_sun_qiang_020",         // 孙总 — champion (technical_evaluator)

  // Supporting accounts
  chen_hailong: "con_chen_hailong_016",   // 某新能源汽车集团 吴总
  wu_jing: "con_wu_jing_017",             // 某新能源汽车集团 周宁
  xu_haifeng: "con_xu_haifeng_014",       // 某国家级能源集团 高总
  lin_na: "con_lin_na_015",               // 某国家级能源集团 陈琳
  yang_guoqiang: "con_yang_guoqiang_021", // 某合资汽车制造企业 杨总
  ma_xiaoli: "con_ma_xiaoli_022",         // 某合资汽车制造企业 马小莉
  zhang_weiguo: "con_zhang_weiguo_023",   // 某综合金融集团 张伟国
  liu_yanfang: "con_liu_yanfang_024",     // 某综合金融集团 刘燕芳
} as const;

// ─── Opportunities ───────────────────────────────────────────────────
export const OPP = {
  // Hero
  platform_cloud: "opp_platform_cloud_001",
  platform_test: "opp_platform_test_002",
  // Case A
  bank_app: "opp_bank_app_005",
  bank_risk: "opp_bank_risk_006",
  // Case B
  cmcc_5g: "opp_cmcc_5g_003",
  cmcc_boss: "opp_cmcc_boss_004",
  // Supporting
  fawvw_mes: "opp_fawvw_mes_007",
  cg_iot: "opp_cg_iot_008",
  sgcc_inspect: "opp_sgcc_inspect_009",
  byd_factory: "opp_byd_factory_010",
  byd_erp: "opp_byd_erp_011",
  pingan_airc: "opp_pingan_airc_012",
  pingan_cloud: "opp_pingan_cloud_013",
  ctelecom_oss: "opp_ctelecom_oss_014",
  midea_mes: "opp_midea_mes_015",
  midea_iot: "opp_midea_iot_016",
  vanke_smart: "opp_vanke_smart_017",
  bytedance_infra: "opp_bytedance_infra_018",
  bytedance_test: "opp_bytedance_test_019",
} as const;

// ─── Evidence IDs (UUID format) ──────────────────────────────────────
export const EV = {
  // Hero: 华东某头部互联网平台
  hw_e1: "4c75e4b5-3f52-4ec7-b831-0ff1970cf301",
  hw_e2: "4c75e4b5-3f52-4ec7-b831-0ff1970cf302",
  hw_e3: "4c75e4b5-3f52-4ec7-b831-0ff1970cf303",
  hw_e4: "4c75e4b5-3f52-4ec7-b831-0ff1970cf304",
  hw_e5: "4c75e4b5-3f52-4ec7-b831-0ff1970cf305",
  hw_e6: "4c75e4b5-3f52-4ec7-b831-0ff1970cf306", // New: CTO扩展意向

  // Case A: 某全国性股份制银行
  cmb_e1: "4c75e4b5-3f52-4ec7-b831-0ff1970cf321",
  cmb_e2: "4c75e4b5-3f52-4ec7-b831-0ff1970cf322",
  cmb_e3: "4c75e4b5-3f52-4ec7-b831-0ff1970cf323", // New: POC预算批准

  // Case B: 某全国性通信运营商
  cm_e1: "4c75e4b5-3f52-4ec7-b831-0ff1970cf311",
  cm_e2: "4c75e4b5-3f52-4ec7-b831-0ff1970cf312",
  cm_e3: "4c75e4b5-3f52-4ec7-b831-0ff1970cf313",
  cm_e4: "4c75e4b5-3f52-4ec7-b831-0ff1970cf314",
  cm_e5: "4c75e4b5-3f52-4ec7-b831-0ff1970cf315",

  // Supporting: 某新能源汽车集团
  byd_e1: "4c75e4b5-3f52-4ec7-b831-0ff1970cf331",
  byd_e2: "4c75e4b5-3f52-4ec7-b831-0ff1970cf332",
  byd_e3: "4c75e4b5-3f52-4ec7-b831-0ff1970cf333",
  byd_e4: "4c75e4b5-3f52-4ec7-b831-0ff1970cf334",
  byd_e5: "4c75e4b5-3f52-4ec7-b831-0ff1970cf335",

  // Supporting: 某国家级能源集团
  sg_e1: "4c75e4b5-3f52-4ec7-b831-0ff1970cf341",
  sg_e2: "4c75e4b5-3f52-4ec7-b831-0ff1970cf342",
  sg_e3: "4c75e4b5-3f52-4ec7-b831-0ff1970cf343",
  sg_e4: "4c75e4b5-3f52-4ec7-b831-0ff1970cf344",
  sg_e5: "4c75e4b5-3f52-4ec7-b831-0ff1970cf345",
  sg_e6: "4c75e4b5-3f52-4ec7-b831-0ff1970cf346",
  sg_e7: "4c75e4b5-3f52-4ec7-b831-0ff1970cf347",
  sg_e8: "4c75e4b5-3f52-4ec7-b831-0ff1970cf348",
} as const;

// ─── Claim IDs (UUID format) ─────────────────────────────────────────
export const CL = {
  // Hero: 华东某头部互联网平台
  hw_c1: "9a4bc682-b0f4-4aef-b463-0a75b1aaf401",
  hw_c2: "9a4bc682-b0f4-4aef-b463-0a75b1aaf402",
  hw_c3: "9a4bc682-b0f4-4aef-b463-0a75b1aaf403",
  hw_c4: "9a4bc682-b0f4-4aef-b463-0a75b1aaf404",

  // Case A: 某全国性股份制银行
  cmb_c1: "9a4bc682-b0f4-4aef-b463-0a75b1aaf421",
  cmb_c2: "9a4bc682-b0f4-4aef-b463-0a75b1aaf422",
  cmb_c3: "9a4bc682-b0f4-4aef-b463-0a75b1aaf423",
  cmb_c4: "9a4bc682-b0f4-4aef-b463-0a75b1aaf424",
  cmb_c5: "9a4bc682-b0f4-4aef-b463-0a75b1aaf425", // New: 安全评审通过

  // Case B: 某全国性通信运营商
  cm_c1: "9a4bc682-b0f4-4aef-b463-0a75b1aaf411",
  cm_c2: "9a4bc682-b0f4-4aef-b463-0a75b1aaf412",
  cm_c3: "9a4bc682-b0f4-4aef-b463-0a75b1aaf413",
  cm_c4: "9a4bc682-b0f4-4aef-b463-0a75b1aaf414",
  cm_c5: "9a4bc682-b0f4-4aef-b463-0a75b1aaf415",

  // Supporting: 某新能源汽车集团
  byd_c1: "9a4bc682-b0f4-4aef-b463-0a75b1aaf431",
  byd_c2: "9a4bc682-b0f4-4aef-b463-0a75b1aaf432",
  byd_c3: "9a4bc682-b0f4-4aef-b463-0a75b1aaf433",
  byd_c4: "9a4bc682-b0f4-4aef-b463-0a75b1aaf434",
  byd_c5: "9a4bc682-b0f4-4aef-b463-0a75b1aaf435",

  // Supporting: 某国家级能源集团
  sg_c1: "9a4bc682-b0f4-4aef-b463-0a75b1aaf441",
  sg_c2: "9a4bc682-b0f4-4aef-b463-0a75b1aaf442",
} as const;
