@Library('Cumulus@1.3-stable')

def projectName = 'codelijst-rie-iepr'
def sonarProjectKey = 'be.vlaanderen.omgeving.data.id.graph:codelijst-rie-iepr'
def isMainBranch = env.BRANCH_IS_PRIMARY
def isDailyBuild = !currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause').isEmpty()
def branchName = env.CHANGE_BRANCH ?: env.BRANCH_NAME

def nodePodSpec = '''
spec:
  containers:
    - name: node
      image: acd-docker.repository.milieuinfo.be/library/node:20-alpine
      command:
        - cat
      tty: true
      env:
        - name: npm_config_cache
          value: /tmp/npm-cache
        - name: COREPACK_NPM_REGISTRY
          value: https://repo.omgeving.vlaanderen.be/artifactory/api/npm/acd-npm
        - name: COREPACK_NPM_USERNAME
          value: jenkins-systeemgebruiker
        - name: COREPACK_NPM_PASSWORD
          valueFrom:
            secretKeyRef:
              name: jenkins-secrets
              key: artifactory_password
      volumeMounts:
        - mountPath: /root/.npmrc
          subPath: .npmrc
          name: js-settings
      resources:
        requests:
          memory: "512Mi"
          cpu: "250m"
        limits:
          memory: "2Gi"
  volumes:
    - name: js-settings
      secret:
        secretName: jenkins-secrets
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

				stage('Build POCs') {
					steps {
						container('node') {
							sh '''
								corepack enable
								for project in poc/poc-flow-operationeel poc/poc-flow-structuur poc/poc-landing; do
									echo "Building ${project}"
									(cd "$project" && pnpm install --frozen-lockfile && pnpm run build)
								done
							'''
						}
					}
					post {
						always {
							archiveArtifacts artifacts: 'poc/poc-flow-operationeel/dist/**,poc/poc-flow-structuur/dist/**,poc/poc-landing/dist/**', allowEmptyArchive: true, fingerprint: true
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

										# Assemble the site: the landing page at the root, each POC in its own subfolder.
										# All three Vite builds use base './', so their assets load relatively.
										SITE="$PWD/.gh-pages-site"
										WORK="$PWD/.gh-pages-deploy"

										rm -rf "$SITE" "$WORK"
										mkdir -p "$SITE/operationeel" "$SITE/structuur"
										cp -r "$PWD/poc/poc-landing/dist"/. "$SITE"/
										cp -r "$PWD/poc/poc-flow-operationeel/dist"/. "$SITE/operationeel"/
										cp -r "$PWD/poc/poc-flow-structuur/dist"/. "$SITE/structuur"/
										touch "$SITE/.nojekyll"

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

										cp -r "$SITE"/. "$WORK"/

										git -C "$WORK" config user.email "$GIT_USER_EMAIL"
										git -C "$WORK" config user.name "$GIT_USER_NAME"
										git -C "$WORK" add -A
										if git -C "$WORK" diff --cached --quiet; then
											echo "No changes to deploy"
										else
											git -C "$WORK" commit -m "poc: deploy landing, operationeel and structuur from ${BUILD_TAG}"
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
		failure {
			script {
				if (!isDailyBuild) {
					rocketchat.notifyAuthor([
						message       : "🚨 ${branchName} ${env.JOB_NAME} #${env.BUILD_NUMBER} is gebroken!",
						includeSummary: true,
						sonarProjectKey: sonarProjectKey
					])
				}
			}
		}
		regression {
			script {
				if (isMainBranch) {
					rocketchat.send([
						channel        : '#jenkins-apocow',
						message        : "🚨 *${projectName}* ${branchName} #${env.BUILD_NUMBER} is gebroken!",
						includeSummary : true,
						sonarProjectKey: sonarProjectKey
					])
				}
			}
		}
		fixed {
			script {
				if (!isDailyBuild) {
					rocketchat.notifyAuthor([message: "✅ ${branchName} ${env.JOB_NAME} is terug succesvol."])
				}
				if (isMainBranch) {
					rocketchat.send([
						channel: '#jenkins-apocow',
						message: "✅ *${projectName}* ${branchName} is terug succesvol."
					])
				}
			}
		}
		always {
			script {
				pipelineSummary([sonarProjectKey: env.BRANCH_IS_PRIMARY ? env.SONAR_PROJECT_KEY : null])
			}
		}
	}
}
