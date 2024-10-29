import { GraphQLObjectType, GraphQLSchema, GraphQLString, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLEnumType } from 'graphql';
import { hashPassword, generateToken } from '../auth/auth.js' 
  
// Define types for GraphQL
const CourseType = new GraphQLObjectType({
  name: 'Course',
  fields: {
    id: { type: GraphQLInt },
    title: { type: GraphQLString },
    category: { type: GraphQLString },
    description: { type: GraphQLString },
    duration: { type: GraphQLInt },
    outcome: { type: GraphQLString },
  },
});

const CollectionType = new GraphQLObjectType({
  name: 'Collection',
  fields: {
    id: { type: GraphQLString }, // Category name is also the ID
    courses: { type: new GraphQLList(CourseType) },
  },
});

const RoleType = new GraphQLEnumType({
  name: 'Role',
  values: {
    Regular: { value: 'Regular' },
    Admin: { value: 'Admin' },
  },
});

const UserType = new GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLString }, // UUID
    username: { type: GraphQLString },
    email: { type: GraphQLString },
    role: { type: RoleType }
  },
});

// Define sorting order enumeration
const SortOrderType = new GraphQLEnumType({
  name: 'SortOrder',
  values: {
    ASC: { value: 'ASC' },
    DESC: { value: 'DESC' },
  },
});

// Root query to get courses and collections
const RootQuery = new GraphQLObjectType({
  name: 'RootQueryType',
  fields: {
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
    course: {
      type: CourseType,
      args: { id: { type: new GraphQLNonNull(GraphQLInt) } },
      resolve: async (_, { id }, { client }) => {
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [id]);
        return res.rows[0];
      },
    },
    collections: {
      type: new GraphQLList(CollectionType),
      resolve: async (_, __, { client }) => {
        const res = await client.query(`SELECT category as id,
          (SELECT json_agg(cs) FROM (SELECT * FROM courses WHERE category = c.category ORDER BY id) cs) AS courses
          FROM courses c
          GROUP BY category`);
        return res.rows;
      },
    },
    collection: {
      type: CollectionType,
      args: { id: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: async (_, { id }, { client }) => {
        const res = await client.query(`SELECT category as id,
          (SELECT json_agg(cs) FROM (SELECT * FROM courses WHERE category = c.category ORDER BY id) cs) AS courses
          FROM courses c
          WHERE category = $1
          GROUP BY category`, [id]);
        return res.rows[0];
      },
    },
      
  },
});

// Root mutation to add, update and delete courses
const Mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
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
    deleteCourse: {
      type: CourseType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
      },
      resolve: async (_, { id }, { client, user }) => {
        if (!user) throw new Error("Unauthorized");
        if (user.role !== "Admin") throw new Error("Unauthorized, only admins can delete courses");
        // get the course to return after deletion
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [id]);
        const courseToDelete = res.rows[0];

        // throw an error if a course is not found
        if (!courseToDelete) {
          throw new Error(`Course with ID ${id} not found`);
        }

        // Delete the course
        await client.query('DELETE FROM courses WHERE id = $1', [id]);

        // Return the deleted course
        return courseToDelete;
      },
    },
    register: {
      type: UserType,
      args: {
        username: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        role: {type: RoleType, defaultValue: 'Regular' }
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

export default new GraphQLSchema({
  query: RootQuery,
  mutation: Mutation,
});