@Library('Cumulus@1.2-stable') _

def nodePodSpec = '''
spec:
  containers:
    - name: node
      image: acd-docker.repository.milieuinfo.be/library/node:20-alpine
      command:
        - cat
      tty: true
      resources:
        requests:
          memory: "512Mi"
          cpu: "250m"
        limits:
          memory: "2Gi"
'''

pipeline {

	agent {
		kubernetes {
			inheritFrom 'jenkins-jenkins-agent'
			yaml podBuilder.from([dind.podSpec(), nodePodSpec, maven.podSpec(25), sonar.podSpec(), trivy.podSpec()])
		}
	}

	options {
		disableConcurrentBuilds()
	}

	environment {
		SONAR_PROJECT_KEY = 'be.vlaanderen.omgeving.data.id.graph:codelijst-rie-iepr'
		GH_PAGES_BRANCH   = 'gh-pages'
		GITHUB_REPO       = 'milieuinfo/codelijst-rie-iepr'
	}

	stages {

		stage('Setup') {
			steps {
				script {
					if (env.BRANCH_IS_PRIMARY) {
						properties([versions.releaseParameters()])
						if (versions.isRelease()) {
							def currentVersion = maven.version()
							def version = versions.bump(currentVersion)
							git.validateTag(version)
							maven.validateVersion(version)
							env.VERSION = version
						}
					} else {
						properties([parameters([
							booleanParam(
								name: 'DEPLOY',
								defaultValue: false,
								description: 'If true, runs mvn deploy instead of mvn verify.'
							)
						])])
					}
				}
			}
		}

		stage('Non-primary branch') {
			when {
				not { expression { env.BRANCH_IS_PRIMARY } }
			}
			parallel {
				stage('Trivy scan') {
					steps {
						script {
							trivy.scanFilesystem([targetPath: 'pom.xml'])
						}
					}
				}

				stage('Maven verify') {
					when {
						expression { !(params.DEPLOY ) }
					}
					steps {
						script {
							maven.goal([goal: 'verify'])
						}
					}
				}

				stage('Maven deploy') {
					when {
						expression { params.DEPLOY }
					}
					steps {
						script {
							maven.goal([goal: 'deploy'])
						}
					}
				}
			}
		}

		stage('Primary branch') {
			when {
				expression { env.BRANCH_IS_PRIMARY }
			}
			stages {
				stage('Maven prepare') {
					when {
						expression { versions.isRelease() }
					}
					steps {
						script {
							maven.goal([
								goal     : 'release:clean release:prepare',
								version  : env.VERSION,
								skipTests: true
							])
						}
					}
				}

				stage('Maven deploy') {
					steps {
						script {
							maven.goal([goal: 'deploy'])
						}
					}
				}

				stage('Sonar scan') {
					steps {
						script {
							sonar.scanMaven([
								projectKey        : env.SONAR_PROJECT_KEY,
								tolerateBadQuality: true
							])
						}
					}
				}

				stage('Maven release') {
					when {
						expression { versions.isRelease() }
					}
					steps {
						script {
							maven.goal([
								goal     : 'release:perform',
								version  : env.VERSION,
								skipTests: true
							])
						}
					}
				}

				stage('Build POC') {
					steps {
						container('node') {
							sh '''
								cd poc/poc-flow-operationeel
								npm config set registry https://repo.omgeving.vlaanderen.be/artifactory/api/npm/acd-npm/
								npm install -g tsc
								npm i --legacy-peer-deps
								npm run build
							'''
						}
					}
					post {
						always {
							archiveArtifacts artifacts: 'poc/poc-flow-operationeel/dist/**', allowEmptyArchive: true, fingerprint: true
						}
					}
				}

				stage('Deploy POC to GitHub Pages') {
					steps {
						container('jnlp') {
							script {
								git.withGitAuth {
									sh '''
										set -e

										DIST="$PWD/poc/poc-flow-operationeel/dist"
										WORK="$PWD/.gh-pages-deploy"

										rm -rf "$WORK"
										if git clone --depth 1 --branch "$GH_PAGES_BRANCH" "https://github.com/${GITHUB_REPO}.git" "$WORK"; then
											git -C "$WORK" checkout -B "$GH_PAGES_BRANCH"
										else
											git clone --depth 1 "https://github.com/${GITHUB_REPO}.git" "$WORK"
											git -C "$WORK" checkout --orphan "$GH_PAGES_BRANCH"
											git -C "$WORK" rm -rq --cached .
										fi

										# Alleen de top-level entries wissen, .git expliciet overslaan.
										# (find zonder -maxdepth daalt af in .git en sloopt de repo.)
										find "$WORK" -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +

										cp -r "$DIST"/. "$WORK"/
										touch "$WORK/.nojekyll"

										git -C "$WORK" config user.email "$GIT_USER_EMAIL"
										git -C "$WORK" config user.name "$GIT_USER_NAME"
										git -C "$WORK" add -A
										if git -C "$WORK" diff --cached --quiet; then
											echo "No changes to deploy"
										else
											git -C "$WORK" commit -m "poc: deploy from ${BUILD_TAG}"
											git -C "$WORK" push origin "HEAD:$GH_PAGES_BRANCH"
										fi
									'''
								}
							}
						}
					}
				}
			}
		}
	}

	post {
		always {
			script {
				pipelineSummary([sonarProjectKey: env.BRANCH_IS_PRIMARY ? env.SONAR_PROJECT_KEY : null])
			}
		}
	}
}
