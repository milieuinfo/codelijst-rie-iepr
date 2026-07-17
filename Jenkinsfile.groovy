@Library('Cumulus@1.2-stable') _

pipeline {

	agent {
		kubernetes {
			inheritFrom 'jenkins-jenkins-agent'
			yaml maven.podSpec(11)
		}
	}

	options {
		disableConcurrentBuilds()
		timestamps()
	}

	environment {
		DEFAULT_RELEASE_BUMP = 'patch'
		RELEASE_SETTINGS     = '/opt/maven-settings/release/settings.xml'
	}

	stages {

		stage('Build') {
			when {
				expression { git.notSkipCi() }
			}
			steps {
				container('maven') {
					sh '''
						set -e
						mvn -B clean deploy
					'''
				}
			}
		}

		stage('Release') {
			when {
				allOf {
					branch 'main'
					expression { git.notSkipCi() }
				}
			}
			steps {
				script {
					def releaseBump = input(
						id: 'release-bump',
						message: 'Select the release bump for this build',
						ok: 'Release',
						parameters: [
							choice(
								name: 'RELEASE_BUMP',
								choices: ['patch', 'minor', 'major'].join('\n'),
								description: 'Version bump to apply to the current -SNAPSHOT version.'
							)
						]
					)

					container('maven') {
						git.withGitAuth {
							withEnv(["RELEASE_BUMP=${releaseBump ?: env.DEFAULT_RELEASE_BUMP}"]) {
								sh '''
									set -e

									current_version=$(mvn -q -DforceStdout help:evaluate -Dexpression=project.version | tail -n 1)

									case "$current_version" in
										*-SNAPSHOT) base_version=${current_version%-SNAPSHOT} ;;
										*)
											echo "Expected a -SNAPSHOT project version, got: $current_version"
											exit 1
											;;
									esac

									IFS='.' read -r major minor patch <<EOF
$base_version
EOF

									if [ -z "$major" ] || [ -z "$minor" ] || [ -z "$patch" ]; then
										echo "Unsupported version format: $base_version"
										exit 1
									fi

									case "$RELEASE_BUMP" in
										major)
											release_version="$((major + 1)).0.0"
											next_snapshot="$((major + 1)).0.1-SNAPSHOT"
											;;
										minor)
											release_version="$major.$((minor + 1)).0"
											next_snapshot="$major.$((minor + 1)).1-SNAPSHOT"
											;;
										patch)
											release_version="$major.$minor.$patch"
											next_snapshot="$major.$minor.$((patch + 1))-SNAPSHOT"
											;;
										*)
											echo "Unsupported release bump: $RELEASE_BUMP"
											exit 1
											;;
									esac

									echo "Preparing release $release_version with next development version $next_snapshot"

									mvn -B -e release:clean release:prepare \
										-DreleaseVersion="$release_version" \
										-DdevelopmentVersion="$next_snapshot"

									mvn -B release:perform -s "$RELEASE_SETTINGS"
								'''
							}
						}
					}
				}
			}
		}
	}
}
