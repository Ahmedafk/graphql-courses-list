import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType
} from 'graphql';
import { hashPassword, generateToken } from '../auth/auth.js';

// Define CourseType for course-related fields and queries
const CourseType = new GraphQLObjectType({
  name: 'Course',
  fields: {
    id: { type: GraphQLInt },              // Unique course ID
    title: { type: GraphQLString },         // Course title
    category: { type: GraphQLString },      // Category of the course
    description: { type: GraphQLString },   // Description of the course
    duration: { type: GraphQLInt },         // Course duration in hours
    outcome: { type: GraphQLString },       // Expected outcome of completing the course
  },
});

// Define CollectionType to group courses by category
const CollectionType = new GraphQLObjectType({
  name: 'Collection',
  fields: {
    id: { type: GraphQLString },                    // Category name serves as ID
    courses: { type: new GraphQLList(CourseType) }, // List of courses in the collection
  },
});

// Define RoleType enum for user roles (Regular, Admin)
const RoleType = new GraphQLEnumType({
  name: 'Role',
  values: {
    Regular: { value: 'Regular' },
    Admin: { value: 'Admin' },
  },
});

// Define UserType for user-related fields and queries
const UserType = new GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLString },         // Unique user ID (UUID)
    username: { type: GraphQLString },   // User's username
    role: { type: RoleType }             // User role, either Regular or Admin
  },
});

// Define SortOrderType enum for sorting order (ASC or DESC)
const SortOrderType = new GraphQLEnumType({
  name: 'SortOrder',
  values: {
    ASC: { value: 'ASC' },
    DESC: { value: 'DESC' },
  },
});

// RootQuery defines the primary queries for courses and collections
const RootQuery = new GraphQLObjectType({
  name: 'RootQueryType',
  fields: {
    // Fetch a list of courses with optional sorting and limit
    courses: {
      type: new GraphQLList(CourseType),
      args: {
        order: { type: SortOrderType, defaultValue: 'ASC' },
        limit: { type: GraphQLInt, defaultValue: 100 },
      },
      resolve: async (_, { limit, order }, { client }) => {
        const res = await client.query(`SELECT * FROM courses ORDER BY id ${order} LIMIT $1`, [limit]);
        return res.rows;
      },
    },

    // Fetch a specific course by ID
    course: {
      type: CourseType,
      args: { id: { type: new GraphQLNonNull(GraphQLInt) } },
      resolve: async (_, { id }, { client }) => {
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [id]);
        return res.rows[0];
      },
    },

    // Fetch all collections grouped by category
    collections: {
      type: new GraphQLList(CollectionType),
      resolve: async (_, __, { client }) => {
        const res = await client.query(`
          SELECT category as id,
          (SELECT json_agg(cs) FROM (SELECT * FROM courses WHERE category = c.category ORDER BY id) cs) AS courses
          FROM courses c
          GROUP BY category
        `);
        return res.rows;
      },
    },

    // Fetch a specific collection by category ID
    collection: {
      type: CollectionType,
      args: { id: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: async (_, { id }, { client }) => {
        const res = await client.query(`
          SELECT category as id,
          (SELECT json_agg(cs) FROM (SELECT * FROM courses WHERE category = c.category ORDER BY id) cs) AS courses
          FROM courses c
          WHERE category = $1
          GROUP BY category
        `, [id]);
        return res.rows[0];
      },
    },
  },
});

// Mutation defines mutations for adding, updating, deleting courses, and user management
const Mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    // Add a new course with required fields
    addCourse: {
      type: CourseType,
      args: {
        title: { type: new GraphQLNonNull(GraphQLString) },
        category: { type: new GraphQLNonNull(GraphQLString) },
        description: { type: new GraphQLNonNull(GraphQLString) },
        duration: { type: new GraphQLNonNull(GraphQLInt) },
        outcome: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: async (_, { title, category, description, duration, outcome }, { client, user }) => {
        if (!user) throw new Error("Unauthorized, invalid or missing token");
        const res = await client.query(
          'INSERT INTO courses (title, category, description, duration, outcome) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [title, category, description, duration, outcome]
        );
        return res.rows[0];
      },
    },

    // Update an existing course by ID with optional fields
    updateCourse: {
      type: CourseType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
        title: { type: GraphQLString },
        category: { type: GraphQLString },
        description: { type: GraphQLString },
        duration: { type: GraphQLInt },
        outcome: { type: GraphQLString },
      },
      resolve: async (_, { id, title, category, description, duration, outcome }, { client, user }) => {
        if (!user) throw new Error("Unauthorized, invalid or missing token");
        const res = await client.query(
          `UPDATE courses 
            SET 
              title = COALESCE($2, title),
              category = COALESCE($3, category), 
              description = COALESCE($4, description), 
              duration = COALESCE($5, duration),
              outcome = COALESCE($6, outcome)
            WHERE id = $1
            RETURNING *`,
          [id, title, category, description, duration, outcome]
        );
        return res.rows[0];
      },
    },

    // Delete a course by ID, only accessible by Admin users
    deleteCourse: {
      type: CourseType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
      },
      resolve: async (_, { id }, { client, user }) => {
        if (!user || user.role !== "Admin") throw new Error("Unauthorized, only admins can delete courses");

        // Fetch the course to return after deletion
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [id]);
        const courseToDelete = res.rows[0];
        if (!courseToDelete) throw new Error(`Course with ID ${id} not found`);

        // Delete the course and return the deleted record
        await client.query('DELETE FROM courses WHERE id = $1', [id]);
        return courseToDelete;
      },
    },

    // Register a new user with hashed password
    register: {
      type: UserType,
      args: {
        username: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        role: { type: RoleType, defaultValue: 'Regular' }
      },
      resolve: async (_, { username, password, role }, { client }) => {
        const hashedPassword = hashPassword(password);
        const res = await client.query(
          'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *',
          [username, hashedPassword, role]
        );
        return res.rows[0];
      },
    },

    // Login and return a JWT token if credentials are valid
    login: {
      type: GraphQLString, // Returns a JWT token
      args: {
        username: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: async (_, { username, password }, { client }) => {
        const res = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = res.rows[0];
        if (!user) throw new Error('User not found');

        const valid = hashPassword(password) === user.password;
        if (!valid) throw new Error('Incorrect password');

        return generateToken(user); // Return the generated JWT
      },
    }
  },
});

// Export the schema, including the query and mutation root types
export default new GraphQLSchema({
  query: RootQuery,
  mutation: Mutation,
});