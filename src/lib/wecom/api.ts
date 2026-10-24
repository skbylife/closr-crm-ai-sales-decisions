/**
 * 企业微信 API 客户端
 *
 * 文档：https://developer.work.weixin.qq.com/document/
 * 所有接口返回 errcode/errmsg，errcode === 0 表示成功。
 */

const WECOM_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';

// ─── Types ──────────────────────────────────────────────────────────

export interface WeComConfig {
  corpId: string;
  corpSecret: string;
}

export interface WeComToken {
  accessToken: string;
  expiresAt: Date;
}

export interface WeComDepartment {
  id: number;
  name: string;
  parentid: number;
  order: number;
}

export interface WeComMember {
  userid: string;
  name: string;
  department: number[];
  position: string;
  mobile: string;
  email: string;
  avatar: string;
  status: number; // 1=已激活 2=已禁用 4=未激活 5=退出
}

export interface WeComExternalContact {
  externalUserId: string;
  name: string;
  type: number; // 1=微信用户 2=企业微信用户
  avatar: string;
  gender: number;
  corpName: string;
  corpFullName?: string;
  position?: string;
  unionid?: string;
  followUsers: Array<{
    userid: string;
    remark: string;
    description: string;
    addTime: number;
    tags: Array<{ tagName: string; type: number }>;
    remarkMobiles?: string[];
    state?: string;
  }>;
}

export interface WeComGroupChat {
  chatId: string;
  status: number;
}

export interface WeComGroupChatDetail {
  chatId: string;
  name: string;
  owner: string;
  createTime: number;
  memberList: Array<{
    userid: string;
    type: number; // 1=企业成员 2=外部联系人
    joinTime: number;
    joinScene: number;
  }>;
  adminList: Array<{ userid: string }>;
}

// ─── Error Handling ─────────────────────────────────────────────────

export class WeComApiError extends Error {
  constructor(
    public errcode: number,
    public errmsg: string,
  ) {
    super(`WeCom API error ${errcode}: ${errmsg}`);
    this.name = 'WeComApiError';
  }
}

interface WeComBaseResponse {
  errcode: number;
  errmsg: string;
}

async function wecomRequest<T extends WeComBaseResponse>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`WeCom HTTP error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as T;
  if (data.errcode !== 0) {
    throw new WeComApiError(data.errcode, data.errmsg);
  }
  return data;
}

// ─── API Functions ──────────────────────────────────────────────────

/**
 * 获取 access_token
 * access_token 有效期 2 小时，需要缓存
 */
export async function getAccessToken(config: WeComConfig): Promise<WeComToken> {
  const url = `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.corpSecret)}`;
  const data = await wecomRequest<
    WeComBaseResponse & { access_token: string; expires_in: number }
  >(url);

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * 获取部门列表
 */
export async function getDepartmentList(
  token: string,
): Promise<WeComDepartment[]> {
  const url = `${WECOM_API_BASE}/department/list?access_token=${encodeURIComponent(token)}`;
  const data = await wecomRequest<
    WeComBaseResponse & { department: Array<{ id: number; name: string; parentid: number; order: number }> }
  >(url);
  return data.department ?? [];
}

/**
 * 获取部门成员详情
 */
export async function getDepartmentMembers(
  token: string,
  departmentId: number,
): Promise<WeComMember[]> {
  const url =
    `${WECOM_API_BASE}/user/list?access_token=${encodeURIComponent(token)}` +
    `&department_id=${departmentId}`;
  const data = await wecomRequest<
    WeComBaseResponse & {
      userlist: Array<{
        userid: string;
        name: string;
        department: number[];
        position: string;
        mobile: string;
        email: string;
        avatar: string;
        status: number;
      }>;
    }
  >(url);
  return (data.userlist ?? []).map((u) => ({
    userid: u.userid,
    name: u.name,
    department: u.department,
    position: u.position,
    mobile: u.mobile ?? '',
    email: u.email ?? '',
    avatar: u.avatar ?? '',
    status: u.status,
  }));
}

/**
 * 获取外部联系人列表（external_userid 数组）
 */
export async function getExternalContactList(
  token: string,
  userId: string,
): Promise<string[]> {
  const url =
    `${WECOM_API_BASE}/externalcontact/list?access_token=${encodeURIComponent(token)}` +
    `&userid=${encodeURIComponent(userId)}`;
  const data = await wecomRequest<
    WeComBaseResponse & { external_userid: string[] }
  >(url);
  return data.external_userid ?? [];
}

/**
 * 获取外部联系人详情
 */
export async function getExternalContactDetail(
  token: string,
  externalUserId: string,
): Promise<WeComExternalContact> {
  const url =
    `${WECOM_API_BASE}/externalcontact/get?access_token=${encodeURIComponent(token)}` +
    `&external_userid=${encodeURIComponent(externalUserId)}`;

  const data = await wecomRequest<
    WeComBaseResponse & {
      external_contact: {
        external_userid: string;
        name: string;
        type: number;
        avatar: string;
        gender: number;
        corp_name: string;
        corp_full_name?: string;
        position?: string;
        unionid?: string;
      };
      follow_user: Array<{
        userid: string;
        remark: string;
        description: string;
        createtime: number;
        tags: Array<{ tag_name: string; type: number }>;
        remark_mobiles?: string[];
        state?: string;
      }>;
    }
  >(url);

  const ec = data.external_contact;
  return {
    externalUserId: ec.external_userid,
    name: ec.name,
    type: ec.type,
    avatar: ec.avatar,
    gender: ec.gender,
    corpName: ec.corp_name,
    corpFullName: ec.corp_full_name,
    position: ec.position,
    unionid: ec.unionid,
    followUsers: (data.follow_user ?? []).map((f) => ({
      userid: f.userid,
      remark: f.remark,
      description: f.description,
      addTime: f.createtime,
      tags: (f.tags ?? []).map((t) => ({ tagName: t.tag_name, type: t.type })),
      remarkMobiles: f.remark_mobiles,
      state: f.state,
    })),
  };
}

/**
 * 获取客户群列表
 */
export async function getGroupChatList(
  token: string,
  options?: {
    statusFilter?: number;
    ownerFilter?: string[];
    cursor?: string;
    limit?: number;
  },
): Promise<{ chatList: WeComGroupChat[]; nextCursor?: string }> {
  const url = `${WECOM_API_BASE}/externalcontact/groupchat/list`;
  const body: Record<string, unknown> = {
    status_filter: options?.statusFilter ?? 0,
    limit: options?.limit ?? 100,
  };
  if (options?.ownerFilter?.length) {
    body.owner_filter = { userid_list: options.ownerFilter };
  }
  if (options?.cursor) {
    body.cursor = options.cursor;
  }

  const data = await wecomRequest<
    WeComBaseResponse & {
      group_chat_list: Array<{ chat_id: string; status: number }>;
      next_cursor?: string;
    }
  >(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // access_token 通过 query 传（企业微信 POST 接口也支持 query）
    },
    body: JSON.stringify({ ...body, access_token: token }),
  });

  return {
    chatList: (data.group_chat_list ?? []).map((g) => ({
      chatId: g.chat_id,
      status: g.status,
    })),
    nextCursor: data.next_cursor || undefined,
  };
}

/**
 * 获取客户群详情
 */
export async function getGroupChatDetail(
  token: string,
  chatId: string,
): Promise<WeComGroupChatDetail> {
  const url = `${WECOM_API_BASE}/externalcontact/groupchat/get`;
  const data = await wecomRequest<
    WeComBaseResponse & {
      group_chat: {
        chat_id: string;
        name: string;
        owner: string;
        create_time: number;
        member_list: Array<{
          userid: string;
          type: number;
          join_time: number;
          join_scene: number;
        }>;
        admin_list: Array<{ userid: string }>;
      };
    }
  >(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, access_token: token }),
  });

  const gc = data.group_chat;
  return {
    chatId: gc.chat_id,
    name: gc.name,
    owner: gc.owner,
    createTime: gc.create_time,
    memberList: (gc.member_list ?? []).map((m) => ({
      userid: m.userid,
      type: m.type,
      joinTime: m.join_time,
      joinScene: m.join_scene,
    })),
    adminList: gc.admin_list ?? [],
  };
}
