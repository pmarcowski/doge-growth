# Title: Global settings and data loading for interactive dog growth prediction Shiny app
# Author: Przemyslaw Marcowski, PhD
# Email: p.marcowski@gmail.com
# Date: 2023-01-02
# Copyright (c) 2023 Przemyslaw Marcowski

# This code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# These are the global settings of a Shiny web application for predicting dog growth

# Import packages
library(shiny)
library(bslib)
library(shinyjs)
library(shinyFeedback)
library(tidyverse)
library(lubridate)
library(brms)
library(plotly)

# Load dog age and weight database
dog_data <- readRDS(file = "data/dog_data.Rds")

# Load fitted growth model
growth_model <- readRDS(file = "model/growth_model.Rds")

# Get available breeds
breeds_list <- as.character(unique(dog_data$breed))

# Define about information text
about_info_text <- HTML("
<p>Welcome to the Dog Growth Prediction App! I'm Przemek, a San Diego-based
researcher and data scientist with a passion for using data to make things
more interesting. I built this app initially to track the growth of my Labrador
puppy Charlie and wanted to share it with other dog lovers as well.</p>

<p>You can explore my other work <a href='https://przemyslawmarcowski.com' target='_blank'>here</a>.</p>

<p>This app uses a canine growth prediction model built with publicly available
data sources. The model utilizes the Bertalanffy growth function, a common
biological phenomenon depicting sigmoidal growth. The function is mathematically
defined as:</p>

$$L_{inf} (1 - exp(-K (age - t_0)))$$

<p>where <em>Linf</em> denotes the asymptotic growth length, <em>K</em> represents
the growth rate, and <em>t0</em> is the hypothetical age at which size is zero.
The model has been adapted for canine growth prediction and fitted in a Bayesian
mixed-effects framework, allowing for breed and sex-based parameter variability.
This provides a robust tool for estimating individual canine growth patterns.</p>
")

# Define model information text
disclaimer_info_text <- HTML("
<p>The canine growth prediction model and the associated Shiny application are for
informational and educational purposes only. The predictions are based on a
dataset that may not accurately represent the growth patterns of all dog
breeds or individual dogs. Various factors, such as genetics, nutrition, health
status, and environment, can influence an individual dog's growth.</p>

<p>Interpret the predictions as general guidelines, not definitive outcomes.
Consult with a veterinary nutrition specialist for personalized advice and
regularly monitor your dog's growth and development. The creator of this
application cannot make any warranties about the completeness, accuracy,
reliability, suitability, or availability of the model, application,
or information contained therein.</p>

<p>By using this application, you agree to this disclaimer and acknowledge the
inherent uncertainties and limitations of the predictions. If you have concerns
about your dog's growth or health, consult with a qualified veterinary
professional.</p>

<p>Any feedback, suggestions, or experiences you may have regarding
this application are welcome. Please feel free to reach out with your
comments or questions.</p>
")
