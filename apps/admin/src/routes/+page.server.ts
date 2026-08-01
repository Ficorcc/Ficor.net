// 根路由：根据登录状态重定向
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // 已登录去仪表盘，未登录去登录页
  throw redirect(303, locals.session ? '/admin/dashboard' : '/admin/login');
};
