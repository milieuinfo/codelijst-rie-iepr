@Library('Cumulus@1.2-stable') _

properties([
	parameters([
		booleanParam(
			name: 'RELEASE',
			defaultValue: false,
			description: 'Release uitvoeren.'
		),
		choice(
			name: 'RELEASE_BUMP',
			choices: ['patch', 'minor', 'major'],
			description: 'Version bump to apply to the current -SNAPSHOT version.'
		)
	])
])

pipeline {

	agent {
		kubernetes {
			inheritFrom 'jenkins-jenkins-agent'
			yaml maven.podSpec(11)
		}
	}

	options {
		disableConcurrentBuilds()
	}

	environment {
		DEFAULT_RELEASE_BUMP = 'patch'
	}

	stages {

		stage('Build') {
			when {
				expression { git.notSkipCi() }
			}
			steps {
				script {
					container('maven') {
						sh '''
							set -e
							apk add --no-cache libstdc++ libgcc
						'''
					}

					maven.goal([
						goal: 'clean deploy'
					])
				}
			}
		}

		stage('Release') {
			when {
				allOf {
					branch 'main'
					expression { git.notSkipCi() }
					expression { params.RELEASE }
				}
			}
			steps {
				script {
					def selectedBump = params.RELEASE_BUMP ?: env.DEFAULT_RELEASE_BUMP
					def currentVersion
					def baseVersionParts
					def releaseVersion
					def nextSnapshot

					container('maven') {
						currentVersion = sh(
							script: 'mvn -q -DforceStdout help:evaluate -Dexpression=project.version | tail -n 1',
							returnStdout: true
						).trim()
					}

					if (!currentVersion.endsWith('-SNAPSHOT')) {
						error("Expected a -SNAPSHOT project version, got: ${currentVersion}")
					}

					baseVersionParts = currentVersion.replace('-SNAPSHOT', '').tokenize('.')
					if (baseVersionParts.size() != 3) {
						error("Unsupported version format: ${currentVersion}")
					}

					def major = baseVersionParts[0] as int
					def minor = baseVersionParts[1] as int
					def patch = baseVersionParts[2] as int

					switch (selectedBump) {
						case 'major':
							releaseVersion = "${major + 1}.0.0"
							nextSnapshot = "${major + 1}.0.1-SNAPSHOT"
							break
						case 'minor':
							releaseVersion = "${major}.${minor + 1}.0"
							nextSnapshot = "${major}.${minor + 1}.1-SNAPSHOT"
							break
						case 'patch':
							releaseVersion = "${major}.${minor}.${patch}"
							nextSnapshot = "${major}.${minor}.${patch + 1}-SNAPSHOT"
							break
						default:
							error("Unsupported release bump: ${selectedBump}")
					}

					echo "Preparing release ${releaseVersion} with next development version ${nextSnapshot}"

					git.withGitAuth {
						container('maven') {
							sh '''
								set -e
								apk add --no-cache libstdc++ libgcc
							'''
						}

						maven.goal([
							goal     : 'release:clean release:prepare',
							extraArgs: "-e -DreleaseVersion=${releaseVersion} -DdevelopmentVersion=${nextSnapshot}"
						])
						maven.goal([
							goal     : 'release:perform',
							extraArgs: '-e'
						])
					}
				}
			}
		}
	}
}
