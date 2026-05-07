# Task Manager

A full-stack team task management web application for creating projects, assigning tasks, tracking progress, and managing team members with role-based access control.

## Live Local App

Run locally and open:

```bash
npm start
```

Then visit:

```text
http://localhost:3000
```

Starter accounts:

```text
Admin:  admin@taskflow.test / admin123
Member: maya@taskflow.test / member123
```

## Features

- Authentication with signup, login, logout, password hashing, and cookie sessions
- Admin and Member role-based access control
- Dashboard with total, completed, in-progress, and overdue task statistics
- Project management with add, edit, delete, open project, status, color, task count, and progress
- Project detail page with project-specific task filters and task creation
- Task management with add, edit, delete, details modal, inline status update, priority, due date, assignee, and project assignment
- My Tasks page filtered to the logged-in user's assignments
- Team page with add member, edit member, delete member, invite member, role badges, and task statistics
- Search and combined task filtering by status, priority, project, and assignee
- Light and dark mode toggle with saved preference
- Responsive sidebar layout with mobile drawer
- Smooth UI animations, hover effects, cards, dialogs, badges, and progress bars
- Persistent local data stored in `data/db.json`
- REST-style API routes for auth, users, projects, tasks, and team invites

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js built-in `http` module
- Database: Local JSON database file (`data/db.json`)
- Authentication: Cookie-based sessions with hashed passwords using Node `crypto`
- Styling: Custom CSS with responsive layouts, light/dark theme variables, animations, cards, badges, and dialogs
- Runtime: Node.js
- Package manager: npm

No external npm dependencies are required.

## Project Structure

```text
.
|-- data/
|   `-- db.json              # Persistent local database
|-- public/
|   |-- app.js               # Frontend application logic
|   |-- index.html           # Main HTML shell
|   `-- styles.css           # Full UI styling and themes
|-- package.json             # npm scripts and project metadata
|-- run-taskflow.ps1         # Windows helper script to run the app
|-- server.js                # Backend server and REST APIs
`-- README.md
```

## Roles and Permissions

| Feature | Admin | Member |
| --- | --- | --- |
| Create projects | Yes | No |
| Edit projects | Yes | No |
| Delete projects | Yes | No |
| Create tasks | Yes | No |
| Edit tasks | Yes | No |
| Delete tasks | Yes | No |
| Change any task status | Yes | No |
| Change own task status | Yes | Yes |
| Add/edit/delete team members | Yes | No |
| Invite team members | Yes | No |
| View dashboard, projects, tasks, my tasks, team | Yes | Yes |

## REST API Overview

Authentication:

- `GET /api/auth/me`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`

App data:

- `GET /api/bootstrap`

Users and team:

- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `POST /api/team/invite`

Projects:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`

Tasks:

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PUT /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`

## Data Models

Project:

- `id`
- `name`
- `description`
- `status`: `active`, `completed`, `archived`
- `color`: `indigo`, `emerald`, `amber`, `rose`, `sky`, `violet`
- `created_at`

Task:

- `id`
- `title`
- `description`
- `status`: `todo`, `in_progress`, `done`
- `priority`: `low`, `medium`, `high`, `urgent`
- `due_date`
- `assigned_to`
- `assigned_to_name`
- `project_id`
- `project_name`
- `created_at`

User:

- `id`
- `full_name`
- `email`
- `role`: `admin`, `user`
- `password_hash`

Project Member:

- `id`
- `project_id`
- `user_email`
- `user_name`
- `role`: `owner`, `member`

Invite:

- `id`
- `email`
- `role`
- `sent_by`
- `created_at`

## How to Run

1. Install Node.js.
2. Open a terminal in the project folder.
3. Run:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

## Notes

- The app uses a local JSON file as the database so it can run without any custom database setup.
- The first seeded admin can manage projects, tasks, and team members.
- Members can view shared data and update only their own assigned task statuses.
- Dark mode is stored in browser `localStorage`.
