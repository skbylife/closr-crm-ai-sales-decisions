-- Add job_level column to org_memberships
-- job_level: 业务职级，决定数据可见范围
--   0 = AE (只看自己的数据)
--   1 = Manager (看团队数据)
--   2 = Director (看部门数据)
--   3 = VP (看所有数据)
--   4 = CxO (看所有数据)
-- 注意：这和 role (owner/admin/member) 是两回事
--   role = 系统权限（谁能管理成员、改设置）
--   job_level = 业务职级（谁能看到多大范围的业务数据）

ALTER TABLE public.org_memberships
  ADD COLUMN IF NOT EXISTS job_level integer NOT NULL DEFAULT 0;

-- 从现有 role_level 初始化 job_level（如果 role_level 有值）
-- UPDATE public.org_memberships
--   SET job_level = role_level
--   WHERE role_level IS NOT NULL AND role_level > 0;
-- (Skipped: role_level column does not exist in fresh installs)

COMMENT ON COLUMN public.org_memberships.job_level IS '业务职级: 0=AE, 1=Manager, 2=Director, 3=VP, 4=CxO — 决定数据可见范围';
-- COMMENT ON COLUMN public.org_memberships.role_level IS '已废弃，使用 job_level 代替'; -- column may not exist
