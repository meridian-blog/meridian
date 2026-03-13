/**
 * GraphQL Schema Definition
 */

export const typeDefs = `
  scalar JSON
  scalar DateTime

  enum PostStatus {
    DRAFT
    SCHEDULED
    PUBLISHED
    UNLISTED
    ARCHIVED
  }

  enum Visibility {
    PUBLIC
    MEMBERS
    PAID
    TIERS
  }

  enum MemberTier {
    FREE
    BASIC
    PREMIUM
    LIFETIME
  }

  enum MemberStatus {
    ACTIVE
    CANCELLED
    PAST_DUE
    TRIALING
  }

  type User {
    id: ID!
    email: String!
    name: String
    avatar: String
    role: String!
    createdAt: DateTime!
  }

  type Member {
    id: ID!
    email: String!
    name: String
    tier: MemberTier!
    status: MemberStatus!
    createdAt: DateTime!
  }

  type Tag {
    id: ID!
    slug: String!
    name: String!
    description: String
    color: String
    postCount: Int!
  }

  type ContentBlock {
    id: ID!
    type: String!
    props: JSON
    content: JSON
  }

  type Post {
    id: ID!
    slug: String!
    title: String!
    excerpt: String
    coverImage: String
    author: User!
    status: PostStatus!
    visibility: Visibility!
    content: [ContentBlock!]!
    tags: [Tag!]!
    featured: Boolean!
    readingTime: Int!
    publishedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PostConnection {
    edges: [Post!]!
    pageInfo: PageInfo!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    total: Int!
    currentPage: Int!
  }

  type SiteSettings {
    title: String!
    description: String
    logo: String
    coverImage: String
    accentColor: String!
    theme: String!
    membersEnabled: Boolean!
    subscriptionsEnabled: Boolean!
  }

  type DashboardStats {
    totalPosts: Int!
    totalMembers: Int!
    newMembersThisMonth: Int!
    totalPageViews: Int!
    recentPosts: [Post!]!
    topPosts: [Post!]!
  }

  input PostFilter {
    status: PostStatus
    visibility: Visibility
    featured: Boolean
    tag: String
    author: ID
  }

  input PaginationInput {
    page: Int = 1
    perPage: Int = 20
  }

  type Query {
    # Posts
    posts(filter: PostFilter, pagination: PaginationInput): PostConnection!
    post(id: ID, slug: String): Post
    
    # Tags
    tags: [Tag!]!
    tag(slug: String!): Tag
    
    # Members
    members(pagination: PaginationInput): [Member!]!
    member(id: ID!): Member
    
    # Settings
    settings: SiteSettings!
    
    # Dashboard
    dashboardStats: DashboardStats!
    
    # Search
    search(query: String!, type: String): [Post!]!
  }

  type Mutation {
    # Posts
    createPost(input: CreatePostInput!): Post!
    updatePost(id: ID!, input: UpdatePostInput!): Post!
    deletePost(id: ID!): Boolean!
    
    # Members
    updateMember(id: ID!, input: UpdateMemberInput!): Member!
    deleteMember(id: ID!): Boolean!
    
    # Settings
    updateSettings(input: UpdateSettingsInput!): SiteSettings!
  }

  input CreatePostInput {
    title: String!
    content: [JSON!]!
    excerpt: String
    coverImage: String
    status: PostStatus = DRAFT
    visibility: Visibility = PUBLIC
    tags: [String!]
    featured: Boolean = false
  }

  input UpdatePostInput {
    title: String
    content: [JSON!]
    excerpt: String
    coverImage: String
    status: PostStatus
    visibility: Visibility
    tags: [String!]
    featured: Boolean
  }

  input UpdateMemberInput {
    name: String
    tier: MemberTier
    status: MemberStatus
  }

  input UpdateSettingsInput {
    title: String
    description: String
    logo: String
    coverImage: String
    accentColor: String
    theme: String
    membersEnabled: Boolean
    subscriptionsEnabled: Boolean
  }
`;
