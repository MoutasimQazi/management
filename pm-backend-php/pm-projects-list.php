<?php
require 'config.php';
require 'auth.php';
$manager = requireManager($pdo, $USERS);

$stmt = $pdo->prepare(
    /* The owning business analyst comes back with the row. Every screen
       that lists projects wants to say who runs each one, and without
       the join each of them would have to fetch the whole managers table
       to turn an id into a name. */
    "SELECT p.project_id, p.manager_id, p.project_name, p.client_name, p.description,
            p.start_date, p.due_date, p.status, p.priority, p.created_at, p.updated_at,
            m.full_name AS manager_name, m.role AS manager_role, m.is_active AS manager_active
     FROM projects p
     LEFT JOIN managers m ON m.manager_id = p.manager_id
     WHERE (? = 'ADMIN' OR p.manager_id = ?)
     ORDER BY p.created_at DESC"
);
$stmt->execute([$manager['role'], $manager['manager_id']]);
echo json_encode($stmt->fetchAll());
