/**
 * Sales Agent 工具函数注册表
 * OpenAI function calling 格式
 */

export const SALES_AGENT_TOOLS = [
  // 1. 更新 MEDDICC 字段
  {
    type: 'function' as const,
    function: {
      name: 'update_meddicc',
      description:
        '更新商机的 MEDDICC 评估字段。只能更新用户明确提到的字段，必须附带用户原话引用。',
      parameters: {
        type: 'object',
        properties: {
          opportunityId: {
            type: 'string',
            description: '商机ID',
          },
          field: {
            type: 'string',
            enum: [
              'metrics',
              'economic_buyer',
              'decision_criteria',
              'decision_process',
              'identify_pain',
              'champion',
              'competition',
            ],
            description: 'MEDDICC 字段名',
          },
          value: {
            type: 'string',
            description: '字段值，必须来自用户原话',
          },
          score: {
            type: ['integer', 'null'],
            description: '评分（0-10），用户未提及时为 null',
          },
          confidence: {
            type: 'string',
            enum: ['explicit', 'implied'],
            description:
              'explicit=用户直接说明; implied=用户暗示但未直接说明; 不得使用 inferred',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填，不可为空',
          },
          needs_clarification: {
            type: 'string',
            description: '如果信息有歧义，说明需要澄清的内容',
          },
        },
        required: ['opportunityId', 'field', 'value', 'confidence', 'source_quote'],
      },
    },
  },

  // 2. 添加联系人备注
  {
    type: 'function' as const,
    function: {
      name: 'add_contact_note',
      description:
        '为联系人添加会议/通话/邮件/观察备注。只记录用户明确提到的信息。',
      parameters: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: '联系人ID',
          },
          note: {
            type: 'string',
            description: '备注内容，必须基于用户原话',
          },
          noteType: {
            type: 'string',
            enum: ['meeting', 'call', 'email', 'observation'],
            description: '备注类型',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['contactId', 'note', 'noteType', 'source_quote'],
      },
    },
  },

  // 3. 创建跟进任务
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description:
        '创建跟进任务。dueDate 为 null 如果用户未指定日期，不得推断日期。',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '任务标题',
          },
          dueDate: {
            type: ['string', 'null'],
            description: '截止日期（ISO 8601 格式），用户未指定时为 null',
          },
          accountId: {
            type: ['string', 'null'],
            description: '关联客户ID，必须来自当前上下文；不确定时为 null',
          },
          opportunityId: {
            type: ['string', 'null'],
            description: '关联商机ID，必须来自当前上下文；不确定时为 null',
          },
          contactId: {
            type: ['string', 'null'],
            description: '关联联系人ID，不确定时为 null',
          },
          assignedTo: {
            type: ['string', 'null'],
            description: '负责人用户ID；不确定时为 null，当前用户可安全推断时使用当前用户ID',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: '任务优先级',
          },
          description: {
            type: 'string',
            description: '任务描述（可选）',
          },
        },
        required: ['title', 'priority'],
      },
    },
  },

  // 4. 推进商机阶段
  {
    type: 'function' as const,
    function: {
      name: 'update_deal_stage',
      description:
        '推进或更新商机的销售阶段。这是不可逆操作，必须有明确的用户确认。',
      parameters: {
        type: 'object',
        properties: {
          opportunityId: {
            type: 'string',
            description: '商机ID',
          },
          newStage: {
            type: 'string',
            description: '新阶段名称',
          },
          reason: {
            type: 'string',
            description: '推进原因说明',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['opportunityId', 'newStage', 'reason', 'source_quote'],
      },
    },
  },

  // 5. 添加客户情报
  {
    type: 'function' as const,
    function: {
      name: 'add_intel',
      description: '向情报库添加新情报。只记录用户明确提到或分享的信息。',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            description: '客户公司ID',
          },
          content: {
            type: 'string',
            description: '情报内容，必须基于用户提供的信息',
          },
          intelType: {
            type: 'string',
            enum: ['budget', 'competitor', 'timeline', 'stakeholder', 'risk', 'opportunity'],
            description: '情报类型',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: '情报优先级',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['accountId', 'content', 'intelType', 'priority', 'source_quote'],
      },
    },
  },

  // 6. 更新联系人画像
  {
    type: 'function' as const,
    function: {
      name: 'update_contact_profile',
      description: '更新联系人的角色、DISC 类型、沟通风格、态度、影响力、参与度等画像信息。只更新用户明确提到的信息。',
      parameters: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: '联系人ID',
          },
          role: {
            type: ['string', 'null'],
            enum: ['decision_maker', 'influencer', 'champion', 'blocker', 'end_user', 'coach', 'economic_buyer', null],
            description: '联系人角色：decision_maker=决策者, influencer=影响者, champion=内部推动者, blocker=阻碍者, end_user=终端用户, coach=教练/线人, economic_buyer=经济决策人。用户未提及时为 null',
          },
          discType: {
            type: ['string', 'null'],
            enum: ['D', 'I', 'S', 'C', null],
            description: 'DISC 性格类型，用户未提及时为 null',
          },
          communicationStyle: {
            type: ['string', 'null'],
            description: '沟通风格描述，用户未提及时为 null',
          },
          attitude: {
            type: ['string', 'null'],
            enum: ['positive', 'neutral', 'negative', 'unknown', null],
            description: '对我方的态度：positive=积极, neutral=中立, negative=消极, unknown=未知',
          },
          influenceLevel: {
            type: ['string', 'null'],
            enum: ['high', 'medium', 'low', null],
            description: '在决策中的影响力级别',
          },
          engagement: {
            type: ['string', 'null'],
            enum: ['active', 'passive', 'inactive', null],
            description: '参与度：active=活跃, passive=被动, inactive=不活跃',
          },
          notes: {
            type: ['string', 'null'],
            description: '个人备注，用户未提及时为 null',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['contactId', 'source_quote'],
      },
    },
  },

  // 7. 创建新联系人
  {
    type: 'function' as const,
    function: {
      name: 'create_contact',
      description:
        '创建新联系人。只填写用户明确提到的字段，未提及的字段设为 null。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '联系人姓名',
          },
          title: {
            type: ['string', 'null'],
            description: '职位，用户未提及时为 null',
          },
          company: {
            type: ['string', 'null'],
            description: '公司名称，用户未提及时为 null',
          },
          email: {
            type: ['string', 'null'],
            description: '邮箱，用户未提及时为 null',
          },
          phone: {
            type: ['string', 'null'],
            description: '电话，用户未提及时为 null',
          },
          accountId: {
            type: ['string', 'null'],
            description: '关联客户公司ID，不确定时为 null',
          },
        },
        required: ['name'],
      },
    },
  },

  // 8. 更新客户公司信息（单字段）
  {
    type: 'function' as const,
    function: {
      name: 'update_account_info',
      description: '更新客户公司的行业、规模、预算周期等信息。只更新用户明确提到的字段。',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            description: '客户公司ID',
          },
          field: {
            type: 'string',
            enum: ['industry', 'size', 'annual_revenue', 'key_initiatives', 'budget_cycle'],
            description: '要更新的字段名',
          },
          value: {
            type: 'string',
            description: '字段值，必须来自用户原话',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['accountId', 'field', 'value', 'source_quote'],
      },
    },
  },

  // ─── 新增工具 ───────────────────────────────────────────────────────────

  // 9. 更新商机
  {
    type: 'function' as const,
    function: {
      name: 'update_opportunity',
      description: '更新商机的名称、金额、阶段、预计关闭日期、赢率、健康度等。只更新用户明确提到的字段。',
      parameters: {
        type: 'object',
        properties: {
          opportunityId: {
            type: 'string',
            description: '商机ID',
          },
          name: {
            type: ['string', 'null'],
            description: '商机名称，用户未提及时为 null',
          },
          value: {
            type: ['number', 'null'],
            description: '商机金额，用户未提及时为 null',
          },
          currency: {
            type: ['string', 'null'],
            description: '货币类型（如 USD/CNY/EUR），用户未提及时为 null',
          },
          stage: {
            type: ['string', 'null'],
            description: '销售阶段，用户未提及时为 null',
          },
          closeDate: {
            type: ['string', 'null'],
            description: '预计关闭日期（ISO 8601），用户未提及时为 null',
          },
          winProbability: {
            type: ['integer', 'null'],
            description: '赢率（0-100），用户未提及时为 null',
          },
          health: {
            type: ['string', 'null'],
            enum: ['healthy', 'at_risk', 'critical', null],
            description: '健康度：healthy=健康, at_risk=有风险, critical=危急',
          },
          notes: {
            type: ['string', 'null'],
            description: '补充备注，用户未提及时为 null',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['opportunityId', 'source_quote'],
      },
    },
  },

  // 10. 更新联系人基础信息
  {
    type: 'function' as const,
    function: {
      name: 'update_contact',
      description: '更新联系人的基础信息（姓名、职位、邮箱、电话、微信、LinkedIn等）。与 update_contact_profile 不同，这个工具改的是基础资料。',
      parameters: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: '联系人ID',
          },
          name: {
            type: ['string', 'null'],
            description: '姓名，用户未提及时为 null',
          },
          title: {
            type: ['string', 'null'],
            description: '职位，用户未提及时为 null',
          },
          email: {
            type: ['string', 'null'],
            description: '邮箱，用户未提及时为 null',
          },
          phone: {
            type: ['string', 'null'],
            description: '电话，用户未提及时为 null',
          },
          wechat: {
            type: ['string', 'null'],
            description: '微信号，用户未提及时为 null',
          },
          linkedin: {
            type: ['string', 'null'],
            description: 'LinkedIn URL 或用户名，用户未提及时为 null',
          },
          department: {
            type: ['string', 'null'],
            description: '部门，用户未提及时为 null',
          },
          seniority: {
            type: ['string', 'null'],
            enum: ['c_level', 'vp', 'director', 'manager', 'senior', 'mid', 'junior', null],
            description: '级别：c_level=C级高管, vp=副总裁, director=总监, manager=经理, senior=资深, mid=中级, junior=初级',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['contactId', 'source_quote'],
      },
    },
  },

  // 11. 添加发现笔记
  {
    type: 'function' as const,
    function: {
      name: 'add_discovery_note',
      description: '记录发现的客户需求、痛点、预算、时间线、决策流程等信息。写入 discovery_notes 表。',
      parameters: {
        type: 'object',
        properties: {
          opportunityId: {
            type: ['string', 'null'],
            description: '关联商机ID，不确定时为 null',
          },
          accountId: {
            type: ['string', 'null'],
            description: '关联客户ID（用于查找商机），不确定时为 null',
          },
          content: {
            type: 'string',
            description: '发现笔记内容，必须基于用户原话',
          },
          noteType: {
            type: 'string',
            enum: ['pain_point', 'need', 'budget', 'timeline', 'decision_process', 'competitor', 'other'],
            description: '笔记类型：pain_point=痛点, need=需求, budget=预算, timeline=时间线, decision_process=决策流程, competitor=竞品, other=其他',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: '优先级',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['content', 'noteType', 'priority', 'source_quote'],
      },
    },
  },

  // 12. 记录活动
  {
    type: 'function' as const,
    function: {
      name: 'log_activity',
      description: '记录销售活动（通话、会议、邮件、拜访、演示）。写入 activity_logs 表。',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: ['string', 'null'],
            description: '客户公司ID，不确定时为 null',
          },
          contactId: {
            type: ['string', 'null'],
            description: '联系人ID，不确定时为 null',
          },
          opportunityId: {
            type: ['string', 'null'],
            description: '关联商机ID，不确定时为 null',
          },
          activityType: {
            type: 'string',
            enum: ['call', 'meeting', 'email', 'visit', 'demo'],
            description: '活动类型：call=通话, meeting=会议, email=邮件, visit=拜访, demo=演示',
          },
          summary: {
            type: 'string',
            description: '活动摘要，必须基于用户原话',
          },
          nextSteps: {
            type: ['string', 'null'],
            description: '下一步计划，用户未提及时为 null',
          },
          date: {
            type: ['string', 'null'],
            description: '活动日期（ISO 8601），用户未提及时为 null（默认当前时间）',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['activityType', 'summary', 'source_quote'],
      },
    },
  },

  // 13. 更新客户（多字段批量）
  {
    type: 'function' as const,
    function: {
      name: 'update_account',
      description: '批量更新客户公司的备注、商机阶段、健康度、金额、策略等信息。不能修改客户名称。',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            description: '客户公司ID',
          },
          notes: {
            type: ['string', 'null'],
            description: '追加备注内容（会追加到现有备注后），用户未提及时为 null',
          },
          dealStage: {
            type: ['string', 'null'],
            description: '交易阶段，用户未提及时为 null',
          },
          dealHealth: {
            type: ['string', 'null'],
            enum: ['healthy', 'at_risk', 'critical', null],
            description: '交易健康度',
          },
          dealValue: {
            type: ['number', 'null'],
            description: '交易金额，用户未提及时为 null',
          },
          strategy: {
            type: ['object', 'null'],
            description: '策略 JSON 对象，用户未提及时为 null',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['accountId', 'source_quote'],
      },
    },
  },

  // 14. 创建新商机
  {
    type: 'function' as const,
    function: {
      name: 'create_opportunity',
      description: '创建新商机。只填写用户明确提到的字段。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '商机名称',
          },
          accountId: {
            type: ['string', 'null'],
            description: '关联客户公司ID，不确定时为 null',
          },
          value: {
            type: ['number', 'null'],
            description: '商机金额，用户未提及时为 null',
          },
          currency: {
            type: ['string', 'null'],
            description: '货币类型（如 USD/CNY），用户未提及时为 null',
          },
          stage: {
            type: ['string', 'null'],
            description: '初始销售阶段，用户未提及时为 null',
          },
          closeDate: {
            type: ['string', 'null'],
            description: '预计关闭日期（ISO 8601），用户未提及时为 null',
          },
          description: {
            type: ['string', 'null'],
            description: '商机描述，用户未提及时为 null',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['name', 'source_quote'],
      },
    },
  },

  // 15. 更新任务状态
  {
    type: 'function' as const,
    function: {
      name: 'update_task',
      description: '更新任务的状态、截止日期或备注。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '任务ID',
          },
          status: {
            type: ['string', 'null'],
            enum: ['pending', 'in_progress', 'completed', 'cancelled', null],
            description: '任务状态，用户未提及时为 null',
          },
          dueDate: {
            type: ['string', 'null'],
            description: '截止日期（ISO 8601），用户未提及时为 null',
          },
          notes: {
            type: ['string', 'null'],
            description: '追加备注，用户未提及时为 null',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['taskId', 'source_quote'],
      },
    },
  },


  // 16. 记录任务执行结果（仅生成确认卡，确认后作为后续客户判断参考）
  {
    type: 'function' as const,
    function: {
      name: 'record_task_outcome',
      description: '记录用户明确说明的任务执行结果，用于 Judgment Timeline 留痕。只有用户明确说任务完成、延期、受阻或取消，并给出原因/结果时才可调用；不要修改任务状态，不要自动改变最终判断。',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '任务ID，必须来自当前上下文或搜索结果；不确定时不要调用',
          },
          accountId: {
            type: ['string', 'null'],
            description: '任务关联客户ID，必须来自当前上下文',
          },
          opportunityId: {
            type: ['string', 'null'],
            description: '任务关联商机ID，必须与任务一致；无则为 null',
          },
          contactId: {
            type: ['string', 'null'],
            description: '任务关联联系人ID，必须与任务一致；无则为 null',
          },
          outcome: {
            type: 'string',
            enum: ['completed', 'delayed', 'blocked', 'canceled', 'unknown'],
            description: '任务执行结果：完成/延期/受阻/取消/未知',
          },
          outcomeNote: {
            type: 'string',
            description: '用户描述的执行结果摘要，必须来自用户原话',
          },
          reason: {
            type: 'string',
            description: '结果原因，必须来自用户原话',
          },
          judgmentImpact: {
            type: ['string', 'null'],
            description: '这条反馈对客户判断的用户视角影响说明，不确定时为 null',
          },
          source_quote: {
            type: 'string',
            description: '用户原话的精确引用，必填',
          },
        },
        required: ['taskId', 'outcome', 'outcomeNote', 'reason', 'source_quote'],
      },
    },
  },

  // ─── 只读搜索工具（自动执行，不需要用户确认）────────────────────────────

  // 17. 读取客户上下文
  {
    type: 'function' as const,
    function: {
      name: 'read_account_context',
      description:
        '从服务端读取某个客户的完整权限内上下文，包括联系人、商机、任务、情报、邮件解读、谋局、活动、证据记录和开放问题。当用户询问当前客户的历史、反馈、所有上下文、谋局、任务或判断依据时，优先使用此工具，不要只依赖前端传入的上下文快照。',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            description: '客户ID，必须来自当前服务端校验后的上下文或搜索结果',
          },
          sections: {
            type: 'array',
            description: '要读取的上下文分区；为空表示读取默认全部分区',
            items: {
              type: 'string',
              enum: [
                'contacts',
                'opportunities',
                'tasks',
                'intel',
                'decodes',
                'strategic_plays',
                'activities',
                'source_records',
                'claims',
                'open_questions',
                'all',
              ],
            },
          },
          limit: {
            type: 'integer',
            description: '每个分区返回数量上限，默认 12，最大 30',
          },
        },
        required: ['accountId'],
      },
    },
  },

  // 18. 搜索联系人
  {
    type: 'function' as const,
    function: {
      name: 'search_contacts',
      description:
        '按姓名、邮箱或电话搜索 Closr 中的联系人。当用户提到某个人名但上下文中没有对应 ID 时，先用此工具搜索。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词（姓名、邮箱或电话）',
          },
          limit: {
            type: 'integer',
            description: '返回数量上限，默认 5',
          },
        },
        required: ['query'],
      },
    },
  },

  // 19. 搜索客户
  {
    type: 'function' as const,
    function: {
      name: 'search_accounts',
      description:
        '按公司名搜索 Closr 中的客户。返回客户信息及其关联联系人列表。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词（公司名称）',
          },
          limit: {
            type: 'integer',
            description: '返回数量上限，默认 3',
          },
        },
        required: ['query'],
      },
    },
  },

  // 20. 搜索商机
  {
    type: 'function' as const,
    function: {
      name: 'search_opportunities',
      description:
        '搜索 Closr 中的商机。可按名称关键词和/或客户ID过滤。返回商机信息及关联客户名。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词（商机名称），可选',
          },
          accountId: {
            type: 'string',
            description: '按客户ID过滤商机，可选',
          },
          limit: {
            type: 'integer',
            description: '返回数量上限，默认 5',
          },
        },
        required: [],
      },
    },
  },
] as const;

/** 搜索工具名称（只读，自动执行） */
export type SearchToolName = 'read_account_context' | 'search_contacts' | 'search_accounts' | 'search_opportunities';

/** 所有搜索工具名称集合 */
export const SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set<SearchToolName>([
  'read_account_context',
  'search_contacts',
  'search_accounts',
  'search_opportunities',
]);

export type SalesAgentToolName =
  | 'update_meddicc'
  | 'add_contact_note'
  | 'create_task'
  | 'update_deal_stage'
  | 'add_intel'
  | 'update_contact_profile'
  | 'create_contact'
  | 'update_account_info'
  | 'update_opportunity'
  | 'update_contact'
  | 'add_discovery_note'
  | 'log_activity'
  | 'update_account'
  | 'create_opportunity'
  | 'update_task'
  | 'record_judgment_feedback'
  | 'record_win_loss_calibration'
  | 'record_task_outcome'
  | SearchToolName;
