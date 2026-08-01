// 根 layout server load：把会话信息传给前端
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    isLoggedIn: !!locals.session,
    session: locals.session
      ? {
          id: locals.session.id,
          createdAt: locals.session.createdAt
        }
      : null
  };
};
