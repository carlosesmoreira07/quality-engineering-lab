import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;

const database = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

const widgetName = 'QEL Featured Products';
const widgetSettings = {
  collection: 'homepage',
  count: 8,
  countPerRow: 4,
  heading: 'Produtos em destaque',
  subText: 'Explore o catálogo de demonstração do Quality Engineering Lab.',
  viewAllLink: '/accessories',
  viewAllLabel: 'Ver catálogo'
};

async function seedDemoDataWhenEmpty() {
  const result = await database.query('SELECT COUNT(*)::integer AS count FROM product');
  if (result.rows[0].count > 0) {
    console.log('Demo data already exists; skipping seed.');
    return;
  }

  const seed = spawnSync('npm', ['run', 'seed', '--', '--all'], {
    cwd: '/app',
    env: process.env,
    stdio: 'inherit'
  });

  if (seed.status !== 0) {
    throw new Error(`EverShop demo data seed failed with exit code ${seed.status}`);
  }
}

async function configureHomepage() {
  const collection = await database.query(
    "SELECT collection_id FROM collection WHERE code = 'homepage' LIMIT 1"
  );
  if (collection.rowCount === 0) {
    throw new Error('The homepage demo collection was not created');
  }

  await database.query('BEGIN');
  try {
    const existing = await database.query(
      `SELECT widget_instance_id
       FROM widget_instance
       WHERE name = $1 AND type = 'collection_products' AND theme IS NULL`,
      [widgetName]
    );

    let widgetId;
    if (existing.rowCount > 0) {
      widgetId = existing.rows[0].widget_instance_id;
      await database.query(
        `UPDATE widget_instance
         SET settings = $1::jsonb, status = TRUE, updated_at = CURRENT_TIMESTAMP
         WHERE widget_instance_id = $2
           AND (settings IS DISTINCT FROM $1::jsonb OR status IS DISTINCT FROM TRUE)`,
        [JSON.stringify(widgetSettings), widgetId]
      );
    } else {
      const inserted = await database.query(
        `INSERT INTO widget_instance (name, type, settings, status, theme)
         VALUES ($1, 'collection_products', $2::jsonb, TRUE, NULL)
         RETURNING widget_instance_id`,
        [widgetName, JSON.stringify(widgetSettings)]
      );
      widgetId = inserted.rows[0].widget_instance_id;
    }

    await database.query(
      `DELETE FROM widget_placement
       WHERE widget_instance_id = $1
         AND NOT (route = 'homepage' AND area = 'content' AND entity_urn IS NULL)`,
      [widgetId]
    );
    await database.query(
      `INSERT INTO widget_placement
         (widget_instance_id, route, area, sort_order, entity_urn, theme)
       SELECT $1, 'homepage', 'content', 10, NULL, NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM widget_placement
         WHERE widget_instance_id = $1
           AND route = 'homepage'
           AND area = 'content'
           AND entity_urn IS NULL
       )`,
      [widgetId]
    );

    await database.query('COMMIT');
    console.log('EverShop homepage baseline configured successfully.');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

try {
  await database.connect();
  await seedDemoDataWhenEmpty();
  await configureHomepage();
} finally {
  await database.end();
}
