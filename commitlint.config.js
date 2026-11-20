export default {
  extends: ["@commitlint/config-conventional"],
  // Dependabot capitalises the verb in its subjects (`chore(deps): Bump …`),
  // which the subject-case rule rejects, and it has no setting for that.
  ignores: [(message) => /^chore\(deps(-dev)?\): Bump /.test(message)],
};
