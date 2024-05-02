# Title: User interface logic for interactive dog growth prediction Shiny app
# Author: Przemyslaw Marcowski, PhD
# Email: p.marcowski@gmail.com
# Date: 2023-06-15
# Copyright (c) 2023 Przemyslaw Marcowski

# This code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# This is the UI logic of a Shiny web application for predicting dog growth

ui <- page_sidebar(
  
  # Set app title
  window_title = "Predict dog growth", 
  
  # Set theme for the app
  theme = bs_theme(
    bootswatch = "shiny") |> 
    # Define custom CSS styles for shiny notifications
    bs_add_rules(
      list(
        "#shiny-notification-panel {
          position: fixed;
          left: calc(0%);
          z-index: 99999;
        }"
        )
      ),
  
  # Include additional JavaScript functionality
  useShinyjs(),
  
  # Define sidebar layout
  sidebar = sidebar(
    width = 400,
    
    # Add title header for the app
    div(
      style = "
        text-align: center;
        color: #0275d8;
      ",
      h5("Predict dog growth")
    ),
    
    # Create navigation set with tabs for sidebar
    navset_tab(
      # Prediction tab
      nav_panel(
        "Prediction",
        br(),
        p("To predict growth, enter your dog's details and click 'Calculate'."),
        selectizeInput("breed", "Breed", choices = c("Select breed", breeds_list), selected = "Select breed"),
        selectizeInput("sex", "Sex", choices = c("Select sex", "Male", "Female"), selected = "Select sex"),
        sliderInput("current_age_slider", "Current age (weeks)", value = 1, min = 1, max = 200),
        radioButtons("switch_age_input", "Age by slider or birthdate?", choices = c("Slider", "Birth date"), selected = "Slider", inline = TRUE),
        dateInput("birthdate", "Birth date", value = as_date(NA)),
        sliderInput("current_weight_slider", "Current weight (lbs)", value = 100, min = 1, max = 200),
        actionButton("predict_weight", "Calculate", width = "100%", class = "btn-primary")
      ),
      
      # Disclaimer tab
      nav_panel(
        "Disclaimer",
        br(),
        withMathJax(
          helpText(disclaimer_info_text)
        )
      ),
      
      # About tab
      nav_panel(
        "About",
        br(),
        withMathJax(
          helpText(about_info_text)
        )
      )
    )
  ),
  
  # Define main content area
  card(plotlyOutput("predict_plot", width = "100%", height = "95vh"))
)
