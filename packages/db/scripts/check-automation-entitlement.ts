import { createDb } from '../src/client';

async function main() {
  const db = createDb(process.env['DATABASE_URL']!);
  try {
    const mods = await db
      .selectFrom('workspace_modules')
      .selectAll()
      .where('module_id', '=', 'automation')
      .execute();
    const perms = await db
      .selectFrom('role_permissions')
      .select(['workspace_id', 'role_id', 'permission'])
      .where('permission', 'like', 'automation:%')
      .execute();
    console.log('automation_modules', mods.length, mods);
    console.log('automation_perms', perms.length);
    console.log(perms.slice(0, 9));
  } finally {
    await db.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
