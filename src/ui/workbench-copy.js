/* Gemini principal-authored public wording, reviewed against approved facts. */
export default {
  "title": "Earn竞品机制工作台",
  "summary": {
    "withQuotes": "已核两份公告覆盖额度加息与持仓奖励机制；最近可核报价仅Bitget，不可跨平台排行。",
    "withoutQuotes": "两份已核公告支持额度加息与持仓奖励机制研究；公开报价缺失，不作横向收益比较。",
    "multipleQuotes": "报价数据可用于分析特定期限定价结构，但因平台口径与规则差异，不能断言全市场高低。"
  },
  "anchors": {
    "mechanisms": "机制工作面",
    "quotes": "产品报价货架",
    "reference": "全局参考"
  },
  "scopeTitle": "七平台观察范围",
  "scopeUnknown": "报价未取得",
  "scopeNote": "报价未知不等于没有产品。",
  "legend": "公告已核，界面待核，效果未测",
  "mechanismsTitle": "连续机制工作面",
  "binance": {
    "name": "额度加息",
    "insight": "研究分层阈值与有效窗口如何组织基础浮动收益与阶段额外奖励的组合关系。",
    "amountFirst": "前1,000 USDT",
    "amountRest": "超过1,000的部分",
    "base": "浮动实时APR",
    "bonus": "额外奖励 APR +4%",
    "baseNote": "约3%仅为公告浮动参考，非当前挂牌利率。",
    "cutoffLabel": "公告截止：10/09 07:59:59北京",
    "after": "按该公告，到期后仅实时浮动收益；实际当前利率及续期未核。",
    "expired": "该公告窗口已结束；到期后按公告仅实时浮动收益，现网利率与续期未核。",
    "stale": "核验超过36小时，当前规则待复核。",
    "hypothesis": "将额外奖励、适用上限、结束时间与后续规则统一表达，降低预期偏差。",
    "verify": "比对现网页面与规则一致性，检验前1000、超出及结束三情境的理解度。",
    "gap": "无现网无法评其表达优劣，无自身页面与测试不能断言改动建议或转化效果。"
  },
  "bybit": {
    "name": "持仓奖励",
    "insight": "通过高频快照与账户排除规则，建立合资格持仓最低余额与异币奖励的发放映射。",
    "hold": "持有USD1",
    "qualify": "须KYC Lv1，符合地区及其他排除资格",
    "measure": "每日24次小时快照取最低合资格余额",
    "exclude": "Flexible/Fixed Savings中的USD1不计入",
    "reward": "奖励WLFI",
    "payment": "主资金账户（次日约14:00北京）",
    "windowLabel": "公告窗口至：10/17 07:59北京",
    "expired": "公告窗口已过，续期未核；保留历史规则，不推断现网实际计奖与发放状态。",
    "stale": "核验超过36小时，当前规则待复核。",
    "hypothesis": "将本金币、奖励币、有效余额及到账时间账户串联表达，厘清收益链路。",
    "verify": "核对入口与奖励页要素，验证总余额≠参与余额、奖励币≠本金币两情境认知。",
    "gap": "无界面不能评估UI呈现，无用户与经营结果不能判定留存及净入金效果。"
  },
  "researchLabels": {
    "hypothesis": "研究假设",
    "verify": "最小验证",
    "gap": "证据缺口"
  },
  "quotes": {
    "title": "公开报价货架（单点参考）",
    "recent": "最近可核报价",
    "history": "历史报价·待复核",
    "noteSingle": "可研究特定金额与期限定价结构，不能据此判断全市场谁更高。",
    "noteMultiple": "各平台计息阶梯与币种机制存在异质性，禁止直接跨平台排行。",
    "empty": "当前公开抓取源缺失，不填补推测值。",
    "conditionNote": "须核对APR/APY原始口径、参与资格限制及采集与生效双时间戳。",
    "platform": "平台",
    "product": "产品名称/ID",
    "coin": "标的币种",
    "term": "产品期限",
    "tiers": "分层阶梯",
    "time": "采集时间",
    "source": "核验来源",
    "clear": "重置筛选条件"
  },
  "reference": {
    "title": "全局参考与基准环境",
    "directoryTitle": "平台产品目录参考",
    "directoryNote": "目录仅作产品形态与收录参考，不能作实时挂牌依据，不参与收益排行。",
    "marketTitle": "外部市场基准参考",
    "protocol": "协议与质押参考",
    "bank": "银行与国债参考（没有存单报价）",
    "funding": "永续资金费率参考",
    "healthTitle": "来源状态",
    "healthNote": "单源抓取异常仅影响对应分析，不削弱既有已核公告事实的证据效力。"
  },
  "loading": "数据加载中",
  "lastGood": "最近有效采集时间",
  "sourceLabel": "出处公告",
  "publicationLabel": "公告发布日",
  "verificationLabel": "事实核验日"
};
