import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data in correct order (respecting foreign keys)
  await prisma.taskTag.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.userOrganization.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organizationRole.deleteMany();
  await prisma.tag.deleteMany();

  // 1. Create Organization Roles
  console.log('Creating roles...');
  const ownerRole = await prisma.organizationRole.create({
    data: { name: 'Owner', description: 'Organization owner with full access' },
  });
  const adminRole = await prisma.organizationRole.create({
    data: { name: 'Admin', description: 'Admin with management access' },
  });
  const memberRole = await prisma.organizationRole.create({
    data: { name: 'Member', description: 'Regular member' },
  });

  // 2. Create Users
  console.log('Creating users...');
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'alice@example.com',
        name: 'Alice Johnson',
        passwordHash: 'hashed_password_1',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
      },
    }),
    prisma.user.create({
      data: {
        email: 'bob@example.com',
        name: 'Bob Smith',
        passwordHash: 'hashed_password_2',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
      },
    }),
    prisma.user.create({
      data: {
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        passwordHash: 'hashed_password_3',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
      },
    }),
    prisma.user.create({
      data: {
        email: 'diana@example.com',
        name: 'Diana Prince',
        passwordHash: 'hashed_password_4',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
      },
    }),
  ]);

  // 3. Create Organizations
  console.log('Creating organizations...');
  const org1 = await prisma.organization.create({
    data: {
      name: 'Acme Corp',
      description: 'A fictional technology company',
    },
  });
  const org2 = await prisma.organization.create({
    data: {
      name: 'TechStart Inc',
      description: 'A startup focused on innovative solutions',
    },
  });

  // 4. Create User-Organization relationships
  console.log('Creating user memberships...');
  await prisma.userOrganization.create({
    data: {
      userId: users[0].id,
      organizationId: org1.id,
      roleId: ownerRole.id,
    },
  });
  await prisma.userOrganization.create({
    data: {
      userId: users[1].id,
      organizationId: org1.id,
      roleId: adminRole.id,
    },
  });
  await prisma.userOrganization.create({
    data: {
      userId: users[2].id,
      organizationId: org1.id,
      roleId: memberRole.id,
    },
  });
  await prisma.userOrganization.create({
    data: {
      userId: users[3].id,
      organizationId: org2.id,
      roleId: ownerRole.id,
    },
  });
  await prisma.userOrganization.create({
    data: {
      userId: users[0].id,
      organizationId: org2.id,
      roleId: adminRole.id,
    },
  });

  // 5. Create Projects
  console.log('Creating projects...');
  const project1 = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      description: 'Redesign the company website',
      organizationId: org1.id,
    },
  });
  const project2 = await prisma.project.create({
    data: {
      name: 'Mobile App',
      description: 'Build a new mobile application',
      organizationId: org1.id,
    },
  });
  const project3 = await prisma.project.create({
    data: {
      name: 'API Development',
      description: 'Develop the public API',
      organizationId: org2.id,
    },
  });

  // 6. Create Tags
  console.log('Creating tags...');
  const tags = await Promise.all([
    prisma.tag.create({ data: { name: 'urgent', color: '#e74c3c' } }),
    prisma.tag.create({ data: { name: 'bug', color: '#9b59b6' } }),
    prisma.tag.create({ data: { name: 'feature', color: '#3498db' } }),
    prisma.tag.create({ data: { name: 'enhancement', color: '#2ecc71' } }),
    prisma.tag.create({ data: { name: 'documentation', color: '#f39c12' } }),
    prisma.tag.create({ data: { name: 'design', color: '#1abc9c' } }),
    prisma.tag.create({ data: { name: 'backend', color: '#34495e' } }),
    prisma.tag.create({ data: { name: 'frontend', color: '#e67e22' } }),
  ]);

  // 7. Create Tasks with assignees
  console.log('Creating tasks...');
  const tasks = await Promise.all([
    // Project 1 tasks
    prisma.task.create({
      data: {
        title: 'Create wireframes',
        description: 'Design wireframes for the new homepage',
        completed: true,
        projectId: project1.id,
        assigneeId: users[0].id,
        dueDate: new Date('2026-05-15'),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Implement navigation',
        description: 'Build the new navigation menu',
        completed: false,
        projectId: project1.id,
        assigneeId: users[1].id,
        dueDate: new Date('2026-05-20'),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Style hero section',
        description: 'Apply styles to the hero section',
        completed: false,
        projectId: project1.id,
        assigneeId: users[2].id,
        dueDate: new Date('2026-05-25'),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Add contact form',
        description: 'Implement the contact form functionality',
        completed: false,
        projectId: project1.id,
        assigneeId: users[0].id,
      },
    }),
    // Project 2 tasks
    prisma.task.create({
      data: {
        title: 'Set up React Native project',
        description: 'Initialize the React Native project',
        completed: true,
        projectId: project2.id,
        assigneeId: users[1].id,
        dueDate: new Date('2026-05-10'),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Implement authentication',
        description: 'Add login and signup screens',
        completed: false,
        projectId: project2.id,
        assigneeId: users[3].id,
        dueDate: new Date('2026-05-18'),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Build dashboard screen',
        description: 'Create the main dashboard view',
        completed: false,
        projectId: project2.id,
        assigneeId: users[1].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Add push notifications',
        description: 'Implement push notification support',
        completed: false,
        projectId: project2.id,
        assigneeId: users[0].id,
      },
    }),
    // Project 3 tasks
    prisma.task.create({
      data: {
        title: 'Design API endpoints',
        description: 'Plan and document the REST API',
        completed: true,
        projectId: project3.id,
        assigneeId: users[3].id,
        dueDate: new Date('2026-05-12'),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Implement user endpoints',
        description: 'Create CRUD for users',
        completed: false,
        projectId: project3.id,
        assigneeId: users[0].id,
        dueDate: new Date('2026-05-22'),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Add authentication middleware',
        description: 'Implement JWT validation',
        completed: false,
        projectId: project3.id,
        assigneeId: users[3].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Write API documentation',
        description: 'Document all endpoints with examples',
        completed: false,
        projectId: project3.id,
        assigneeId: users[0].id,
      },
    }),
  ]);

  // 8. Create Comments
  console.log('Creating comments...');
  await Promise.all([
    prisma.comment.create({
      data: {
        content: 'Looking good so far!',
        taskId: tasks[1].id,
        userId: users[0].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Can we add a dark mode option?',
        taskId: tasks[1].id,
        userId: users[2].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Started working on this.',
        taskId: tasks[4].id,
        userId: users[1].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Need the design specs first.',
        taskId: tasks[5].id,
        userId: users[3].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'API design looks solid.',
        taskId: tasks[8].id,
        userId: users[0].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Will use Express middleware.',
        taskId: tasks[10].id,
        userId: users[3].id,
      },
    }),
  ]);

  // 9. Create Task-Tag associations
  console.log('Creating task-tag associations...');
  await Promise.all([
    // Project 1 tags
    prisma.taskTag.create({ data: { taskId: tasks[0].id, tagId: tags[5].id } }), // design
    prisma.taskTag.create({ data: { taskId: tasks[1].id, tagId: tags[7].id } }), // frontend
    prisma.taskTag.create({ data: { taskId: tasks[2].id, tagId: tags[7].id } }), // frontend
    prisma.taskTag.create({ data: { taskId: tasks[2].id, tagId: tags[5].id } }), // design
    prisma.taskTag.create({ data: { taskId: tasks[3].id, tagId: tags[7].id } }), // frontend
    // Project 2 tags
    prisma.taskTag.create({ data: { taskId: tasks[4].id, tagId: tags[2].id } }), // feature
    prisma.taskTag.create({ data: { taskId: tasks[5].id, tagId: tags[2].id } }), // feature
    prisma.taskTag.create({ data: { taskId: tasks[6].id, tagId: tags[2].id } }), // feature
    prisma.taskTag.create({ data: { taskId: tasks[7].id, tagId: tags[0].id } }), // urgent
    // Project 3 tags
    prisma.taskTag.create({ data: { taskId: tasks[8].id, tagId: tags[4].id } }), // documentation
    prisma.taskTag.create({ data: { taskId: tasks[9].id, tagId: tags[6].id } }), // backend
    prisma.taskTag.create({ data: { taskId: tasks[9].id, tagId: tags[2].id } }), // feature
    prisma.taskTag.create({
      data: { taskId: tasks[10].id, tagId: tags[6].id },
    }), // backend
    prisma.taskTag.create({
      data: { taskId: tasks[10].id, tagId: tags[3].id },
    }), // enhancement
    prisma.taskTag.create({
      data: { taskId: tasks[11].id, tagId: tags[4].id },
    }), // documentation
  ]);

  // Summary
  console.log('\n✅ Seed completed successfully!');
  console.log(`   - ${await prisma.organizationRole.count()} roles`);
  console.log(`   - ${await prisma.user.count()} users`);
  console.log(`   - ${await prisma.organization.count()} organizations`);
  console.log(`   - ${await prisma.userOrganization.count()} memberships`);
  console.log(`   - ${await prisma.project.count()} projects`);
  console.log(`   - ${await prisma.task.count()} tasks`);
  console.log(`   - ${await prisma.comment.count()} comments`);
  console.log(`   - ${await prisma.tag.count()} tags`);
  console.log(`   - ${await prisma.taskTag.count()} task-tag associations`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
