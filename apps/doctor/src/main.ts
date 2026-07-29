const role = 'doctor';
const version = process.env.COPALIBRE_VERSION ?? '0.0.0';

// Placeholder entrypoint: reports identity and exits 0 so container healthchecks
// and 'copalibre doctor' have a stable contract from the first commit.

console.log(JSON.stringify({ role, version, status: 'placeholder' }));
process.exit(0);
